/*
 * Data model, persistence and calculations. No DOM access in here.
 *
 * Everything lives under one localStorage key (KEY) as a single JSON document:
 *   { app, schema, savedAt, profile, settings, exerciseOverrides, customExercises,
 *     templates, sessions, records, activeSessionId, restTimer }
 * Weights are always stored in kg; the UI converts for display when the profile uses lb.
 * Timestamps are ISO 8601 strings (UTC, from Date#toISOString); calendar days are local
 * "YYYY-MM-DD" strings taken from the workout's start time.
 */
(function () {
  const { EXERCISES, PROGRAM } = window.GT_DATA;
  const KEY = "gymtrack:v1";
  const SCHEMA = 1;
  const APP = "gym-tracker";
  const MET = { light: 3.0, moderate: 3.5, vigorous: 6.0 };
  const LB = 0.45359237;
  const E1RM_MAX_REPS = 20; // Epley gets unreliable beyond this; we don't estimate above it.

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = (p) => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const num = (v) => (v === "" || v === null || v === undefined || !isFinite(+v) ? null : +v);
  const pad = (n) => String(n).padStart(2, "0");
  const localDate = (d) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const parseLocal = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseLocal(s); d.setDate(d.getDate() + n); return localDate(d); };
  // Weeks run Monday–Sunday.
  const weekStart = (s) => { const d = parseLocal(s); return addDays(s, -((d.getDay() + 6) % 7)); };
  const isIsoDate = (s) => typeof s === "string" && !isNaN(Date.parse(s));

  const BUILTIN = {};
  EXERCISES.forEach((e) => { BUILTIN[e.id] = e; });

  function defaults() {
    return {
      app: APP, schema: SCHEMA, savedAt: null,
      profile: { bodyWeightKg: null, heightCm: null, age: null, sex: "", goal: "general", units: "kg", defaultDurationMin: 60 },
      settings: { theme: "dark", defaultIntensity: "moderate", includeActiveInTotals: false, autoRest: true, restSound: true },
      exerciseOverrides: {},
      customExercises: {},
      templates: clone(PROGRAM),
      sessions: [],
      records: { history: [], best: {} },
      activeSessionId: null,
      restTimer: null,
    };
  }

  // Fill gaps and drop junk so older or hand-edited data still loads.
  function normalize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== "object") return d;
    const out = d;
    if (raw.profile && typeof raw.profile === "object") Object.assign(out.profile, raw.profile);
    if (raw.settings && typeof raw.settings === "object") Object.assign(out.settings, raw.settings);
    ["bodyWeightKg", "heightCm", "age", "defaultDurationMin"].forEach((k) => { out.profile[k] = num(out.profile[k]); });
    if (!out.profile.defaultDurationMin) out.profile.defaultDurationMin = 60;
    if (!["kg", "lb"].includes(out.profile.units)) out.profile.units = "kg";
    if (!MET[out.settings.defaultIntensity]) out.settings.defaultIntensity = "moderate";
    if (!["dark", "light"].includes(out.settings.theme)) out.settings.theme = "dark";
    if (raw.exerciseOverrides && typeof raw.exerciseOverrides === "object") out.exerciseOverrides = raw.exerciseOverrides;
    if (raw.customExercises && typeof raw.customExercises === "object") {
      Object.values(raw.customExercises).forEach((e) => {
        if (e && e.id && e.name) out.customExercises[e.id] = Object.assign({ equipment: "machine", muscles: [], kind: "reps", load: "stack", technique: [], image: null, custom: true }, e);
      });
    }
    if (Array.isArray(raw.templates) && raw.templates.length) {
      out.templates = raw.templates.filter((t) => t && t.id && Array.isArray(t.slots)).map((t) => Object.assign({ muscles: [], name: t.id }, t, {
        slots: t.slots.filter((s) => s && s.id && s.primary).map((s) => Object.assign({ sets: 3, repsMin: 8, repsMax: 12, rest: 90, perSide: false }, s)),
      }));
      if (!out.templates.length) out.templates = clone(PROGRAM);
    }
    if (Array.isArray(raw.sessions)) out.sessions = raw.sessions.filter(validSession).map(fixSession);
    if (raw.records && Array.isArray(raw.records.history)) out.records = raw.records;
    out.activeSessionId = out.sessions.some((s) => s.id === raw.activeSessionId && s.status === "active") ? raw.activeSessionId : null;
    if (!out.activeSessionId) {
      const act = out.sessions.find((s) => s.status === "active");
      if (act) out.activeSessionId = act.id;
    }
    // Only one session may be active. Any other "active" session is an orphan: keep it, but never count it.
    out.sessions.forEach((s) => { if (s.status === "active" && s.id !== out.activeSessionId) s.status = "abandoned"; });
    out.restTimer = raw.restTimer && typeof raw.restTimer === "object" ? raw.restTimer : null;
    return out;
  }

  function validSession(s) {
    return s && typeof s === "object" && typeof s.id === "string" && typeof s.dayId === "string" &&
      isIsoDate(s.startedAt) && Array.isArray(s.exercises) && ["active", "completed", "abandoned"].includes(s.status);
  }
  function fixSession(s) {
    s.localDate = s.localDate || localDate(s.startedAt);
    s.pausedMs = num(s.pausedMs) || 0;
    s.intensity = MET[s.intensity] ? s.intensity : "moderate";
    s.exercises.forEach((e) => {
      e.sets = e.sets || { primary: [], alt: [] };
      ["primary", "alt"].forEach((v) => {
        if (!Array.isArray(e.sets[v])) e.sets[v] = [];
        e.sets[v].forEach((x) => { x.w = num(x.w); x.r = num(x.r); x.rpe = num(x.rpe); x.done = !!x.done; x.skipped = !!x.skipped; x.extra = !!x.extra; });
      });
      if (!["primary", "alt"].includes(e.variant)) e.variant = "primary";
    });
    return s;
  }

  // ---------- persistence
  let state = defaults();
  let lastSaveError = null;
  const listeners = [];

  function load() {
    let raw = null, problem = null;
    try { raw = localStorage.getItem(KEY); } catch (err) { problem = "Storage is blocked in this browser, so nothing will be saved."; }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.app && parsed.app !== APP) throw new Error("not ours");
        if (parsed.schema > SCHEMA) problem = "This data was saved by a newer version of the app. It loaded, but some fields may be ignored.";
        state = normalize(parsed);
      } catch (err) {
        problem = "Saved data was unreadable and could not be loaded. A copy was kept in storage under \"" + KEY + ":corrupt\".";
        try { localStorage.setItem(KEY + ":corrupt", raw); } catch (e) { /* ignore */ }
        state = defaults();
      }
    }
    recomputeRecords();
    return problem;
  }

  function save() {
    state.savedAt = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      lastSaveError = null;
    } catch (err) {
      lastSaveError = err && err.name === "QuotaExceededError"
        ? "Storage is full. Export a backup and delete old workouts."
        : "Couldn't save to this browser's storage (private browsing or blocked storage?). Export a backup so you don't lose data.";
    }
    listeners.forEach((fn) => fn(lastSaveError));
    return !lastSaveError;
  }
  let saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }
  function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; save(); } }

  // ---------- exercises & templates
  function exercise(id) {
    const base = state.customExercises[id] || BUILTIN[id];
    if (!base) return null;
    const ov = state.exerciseOverrides[id];
    return ov ? Object.assign({}, base, ov) : base;
  }
  function allExercises() {
    return Object.keys(BUILTIN).concat(Object.keys(state.customExercises)).map(exercise);
  }
  const isModified = (id) => !!state.exerciseOverrides[id] && Object.keys(state.exerciseOverrides[id]).length > 0;
  function defaultSlot(slotId) {
    for (const d of PROGRAM) for (const s of d.slots) if (s.id === slotId) return s;
    return null;
  }
  function slotModified(slot) {
    const d = defaultSlot(slot.id);
    if (!d) return false;
    return ["primary", "alt", "sets", "repsMin", "repsMax", "rest", "perSide"].some((k) => d[k] !== slot[k]);
  }
  const template = (dayId) => state.templates.find((t) => t.id === dayId);
  const slotUsage = (exId) => {
    const out = [];
    state.templates.forEach((t, di) => t.slots.forEach((s) => {
      if (s.primary === exId) out.push({ day: t, slot: s, role: "primary", dayIndex: di });
      if (s.alt === exId) out.push({ day: t, slot: s, role: "alt", dayIndex: di });
    }));
    return out;
  };

  // ---------- sessions
  const snap = (ex) => ex ? { id: ex.id, name: ex.name, equipment: ex.equipment, kind: ex.kind, load: ex.load } : null;
  const midReps = (lo, hi) => Math.floor((lo + hi) / 2);

  // Most recent completed sets for an exercise variant, newest session first.
  function lastPerformance(exId, beforeIso) {
    const list = state.sessions.filter((s) => s.status === "completed" && (!beforeIso || s.startedAt < beforeIso))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    for (const s of list) {
      for (const e of s.exercises) {
        const v = e[e.variant];
        if (!e.skipped && v && v.id === exId) {
          const sets = e.sets[e.variant].filter((x) => x.done && !x.skipped);
          if (sets.length) return { session: s, entry: e, sets };
        }
      }
    }
    return null;
  }

  function buildSets(ex, target) {
    const last = lastPerformance(ex.id);
    return Array.from({ length: target.sets }, (_, i) => {
      const prev = last && (last.sets[i] || last.sets[last.sets.length - 1]);
      return { w: prev ? prev.w : null, r: midReps(target.repsMin, target.repsMax), rpe: null, done: false, skipped: false, extra: false, doneAt: null };
    });
  }

  function targetFor(slot, variant) {
    const alt = variant === "alt";
    return {
      sets: slot.sets,
      repsMin: alt && slot.altRepsMin ? slot.altRepsMin : slot.repsMin,
      repsMax: alt && slot.altRepsMax ? slot.altRepsMax : slot.repsMax,
      perSide: alt && slot.altPerSide !== undefined ? slot.altPerSide : !!slot.perSide,
      rest: slot.rest,
      restLabel: slot.restLabel && defaultSlot(slot.id) && defaultSlot(slot.id).rest === slot.rest ? slot.restLabel : slot.rest + " s",
    };
  }

  function startSession(dayId) {
    const t = template(dayId);
    if (!t) throw new Error("Unknown workout day");
    const now = new Date();
    const s = {
      id: uid("s"), dayId, dayName: t.name, dayNumber: state.templates.indexOf(t) + 1, status: "active",
      startedAt: now.toISOString(), endedAt: null, localDate: localDate(now),
      pausedMs: 0, pausedAt: null, durationMin: null, durationEdited: false,
      intensity: state.settings.defaultIntensity, bodyWeightKg: null, calories: null,
      exercises: t.slots.map((slot) => {
        const p = exercise(slot.primary), a = slot.alt ? exercise(slot.alt) : null;
        const tp = targetFor(slot, "primary"), ta = targetFor(slot, "alt");
        return {
          slotId: slot.id, variant: "primary", skipped: false,
          primary: snap(p), alt: snap(a), target: { primary: tp, alt: ta },
          sets: { primary: p ? buildSets(p, tp) : [], alt: a ? buildSets(a, ta) : [] },
        };
      }).filter((e) => e.primary),
    };
    state.sessions.push(s);
    state.activeSessionId = s.id;
    state.restTimer = null;
    save();
    return s;
  }

  const session = (id) => state.sessions.find((s) => s.id === id);
  const activeSession = () => (state.activeSessionId ? session(state.activeSessionId) : null);

  function elapsedMs(s, now = Date.now()) {
    const end = s.endedAt ? Date.parse(s.endedAt) : s.pausedAt ? Date.parse(s.pausedAt) : now;
    return Math.max(0, end - Date.parse(s.startedAt) - (s.pausedMs || 0));
  }
  function togglePause(s) {
    if (s.pausedAt) { s.pausedMs += Date.now() - Date.parse(s.pausedAt); s.pausedAt = null; }
    else s.pausedAt = new Date().toISOString();
    save();
  }

  // ---------- per-exercise metrics
  const curSets = (e) => e.sets[e.variant] || [];
  const curEx = (e) => e[e.variant] || e.primary;
  const curTarget = (e) => (e.target && e.target[e.variant]) || e.target.primary;
  const doneSets = (e) => (e.skipped ? [] : curSets(e).filter((x) => x.done && !x.skipped));
  function exStatus(e) {
    if (e.skipped) return "skipped";
    const sets = curSets(e);
    const required = sets.filter((x) => !x.extra && !x.skipped);
    const done = sets.filter((x) => x.done && !x.skipped).length;
    if (done > 0 && required.every((x) => x.done)) return "done";
    return done > 0 ? "progress" : "pending";
  }
  const exVolume = (e) => curEx(e).kind === "time" ? 0 : doneSets(e).reduce((t, x) => t + (x.w > 0 && x.r > 0 ? x.w * x.r : 0), 0);
  const e1rm = (w, r) => (w > 0 && r >= 1 && r <= E1RM_MAX_REPS ? w * (1 + r / 30) : null);

  function sessionStats(s) {
    let exDone = 0, exSkipped = 0, sets = 0, reqSets = 0, reqDone = 0, volume = 0;
    s.exercises.forEach((e) => {
      const st = exStatus(e);
      if (st === "done") exDone++;
      if (st === "skipped") exSkipped++;
      sets += doneSets(e).length;
      volume += exVolume(e);
      if (!e.skipped) curSets(e).forEach((x) => { if (!x.extra && !x.skipped) { reqSets++; if (x.done) reqDone++; } });
    });
    const handled = exDone + exSkipped;
    return { exDone, exSkipped, exTotal: s.exercises.length, sets, volume, reqSets, reqDone,
      pct: s.exercises.length ? Math.round((reqSets ? reqDone / reqSets : handled / s.exercises.length) * 100) : 0 };
  }

  // ---------- calories (MET method). Gross is what all totals use.
  function calories(met, kg, minutes) {
    if (!(kg > 0) || !(minutes > 0)) return null;
    return { met, gross: met * 3.5 * kg / 200 * minutes, active: Math.max(0, (met - 1) * 3.5 * kg / 200 * minutes) };
  }
  // An active workout follows the current profile weight; a saved one keeps the weight it was saved with.
  function liveCalories(s) {
    const kg = s.status === "active" ? state.profile.bodyWeightKg : s.bodyWeightKg;
    return calories(MET[s.intensity], kg, elapsedMs(s) / 60000);
  }
  function finishSession(s, { durationMin, intensity, bodyWeightKg }) {
    s.intensity = intensity;
    s.bodyWeightKg = bodyWeightKg;
    if (s.pausedAt) togglePause(s);
    if (!s.endedAt) s.endedAt = new Date().toISOString();
    const measured = Math.round(elapsedMs(s) / 6000) / 10;
    s.durationMin = durationMin;
    s.durationEdited = Math.abs(measured - durationMin) > 0.05;
    s.calories = calories(MET[intensity], bodyWeightKg, durationMin);
    s.status = "completed";
    if (state.activeSessionId === s.id) { state.activeSessionId = null; state.restTimer = null; }
    recomputeRecords();
    save();
  }
  function updateCompletedMeta(s, { durationMin, intensity, bodyWeightKg }) {
    s.durationMin = durationMin; s.intensity = intensity; s.bodyWeightKg = bodyWeightKg; s.durationEdited = true;
    s.calories = calories(MET[intensity], bodyWeightKg, durationMin);
    save();
  }
  function discardSession(id) {
    state.sessions = state.sessions.filter((s) => s.id !== id);
    if (state.activeSessionId === id) { state.activeSessionId = null; state.restTimer = null; }
    recomputeRecords();
    save();
  }

  // Totals over completed sessions in [from, to] local dates. Each session is counted once by id.
  function totals(from, to, includeActive) {
    const seen = new Set();
    const out = { workouts: 0, days: new Set(), exercises: 0, sets: 0, volume: 0, kcal: 0, kcalActive: 0, minutes: 0, missingKcal: 0, sessions: [] };
    state.sessions.forEach((s) => {
      if (seen.has(s.id) || s.localDate < from || s.localDate > to) return;
      const isActive = s.status === "active" && includeActive;
      if (s.status !== "completed" && !isActive) return;
      seen.add(s.id);
      const st = sessionStats(s);
      const kc = isActive ? liveCalories(s) : s.calories;
      out.workouts += s.status === "completed" ? 1 : 0;
      if (s.status === "completed") out.days.add(s.dayId);
      out.exercises += st.exDone; out.sets += st.sets; out.volume += st.volume;
      out.minutes += isActive ? elapsedMs(s) / 60000 : s.durationMin || 0;
      if (kc) { out.kcal += kc.gross; out.kcalActive += kc.active; } else out.missingKcal++;
      out.sessions.push(s);
    });
    return out;
  }

  // ---------- personal records
  // Records are rebuilt by replaying completed sessions in time order, so editing or deleting a
  // workout never leaves stale or duplicate records. The first value seen for an exercise is a
  // baseline (kept in history, flagged first:true) and is not celebrated as a PB.
  const wKey = (w) => (Math.round((w || 0) * 100) / 100).toFixed(2);
  function aggregate(e) {
    const ex = curEx(e);
    const sets = doneSets(e).filter((x) => x.r > 0);
    if (!sets.length) return null;
    const agg = { kind: ex.kind, maxW: null, e1rm: null, volume: null, maxTime: null, repsAt: {} };
    sets.forEach((x) => {
      if (ex.kind === "time") { if (!agg.maxTime || x.r > agg.maxTime.value) agg.maxTime = { value: x.r, w: x.w || 0 }; return; }
      const w = x.w > 0 ? x.w : 0;
      if (w > 0 && (!agg.maxW || w > agg.maxW.value || (w === agg.maxW.value && x.r > agg.maxW.reps))) agg.maxW = { value: w, reps: x.r };
      const est = e1rm(w, x.r);
      if (est && (!agg.e1rm || est > agg.e1rm.value)) agg.e1rm = { value: est, w, reps: x.r };
      const k = wKey(w);
      if (!agg.repsAt[k] || x.r > agg.repsAt[k]) agg.repsAt[k] = x.r;
    });
    const vol = exVolume(e);
    if (vol > 0) agg.volume = { value: vol };
    return agg;
  }

  // Compare one exercise aggregate against bests; returns new history entries and mutates best.
  function applyAggregate(best, exId, name, agg, meta) {
    const b = best[exId] || (best[exId] = { name, maxW: null, e1rm: null, volume: null, maxTime: null, repsAt: {} });
    b.name = name;
    const found = [];
    const take = (type, cur, extra) => {
      if (!cur) return;
      const prev = b[type];
      if (!prev || cur.value > prev.value + 1e-9) {
        found.push(Object.assign({ type, exId, name, value: cur.value, prev: prev ? prev.value : null, prevDetail: prev, first: !prev }, extra, meta));
        b[type] = Object.assign({ date: meta.date, sessionId: meta.sessionId }, cur);
      }
    };
    take("maxW", agg.maxW, { reps: agg.maxW && agg.maxW.reps });
    take("e1rm", agg.e1rm, { w: agg.e1rm && agg.e1rm.w, reps: agg.e1rm && agg.e1rm.reps });
    take("volume", agg.volume, {});
    take("maxTime", agg.maxTime, {});
    Object.keys(agg.repsAt).forEach((k) => {
      const prev = b.repsAt[k];
      const reps = agg.repsAt[k];
      if (prev && reps > prev.reps) found.push(Object.assign({ type: "repsAt", exId, name, value: reps, prev: prev.reps, w: +k, first: false }, meta));
      if (!prev || reps > prev.reps) b.repsAt[k] = { reps, date: meta.date, sessionId: meta.sessionId };
    });
    return found;
  }

  function recomputeRecords() {
    const best = {}, history = [];
    const done = state.sessions.filter((s) => s.status === "completed").sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    done.forEach((s) => {
      s.exercises.forEach((e) => {
        if (e.skipped) return;
        const agg = aggregate(e);
        if (!agg) return;
        const ex = curEx(e);
        history.push(...applyAggregate(best, ex.id, ex.name, agg, { date: s.endedAt || s.startedAt, localDate: s.localDate, sessionId: s.id, dayName: s.dayName }));
      });
    });
    history.forEach((h, i) => { h.id = h.sessionId + ":" + h.exId + ":" + h.type + (h.type === "repsAt" ? ":" + wKey(h.w) : "") + ":" + i; });
    state.records = { history, best };
  }

  // Records the active (or edited) session would set if saved now, against all other completed sessions.
  function pendingRecords(s) {
    const best = {};
    state.sessions.filter((x) => x.status === "completed" && x.id !== s.id && x.startedAt < s.startedAt)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .forEach((x) => x.exercises.forEach((e) => {
        if (e.skipped) return;
        const agg = aggregate(e);
        if (agg) applyAggregate(best, curEx(e).id, curEx(e).name, agg, { date: x.startedAt, sessionId: x.id });
      }));
    const byEntry = {};
    s.exercises.forEach((e, i) => {
      if (e.skipped) return;
      const agg = aggregate(e);
      if (!agg) return;
      const found = applyAggregate(clone(best), curEx(e).id, curEx(e).name, agg, { date: new Date().toISOString(), sessionId: s.id });
      byEntry[i] = found.filter((f) => !f.first);
    });
    return { best, byEntry };
  }

  const sessionPRs = (id) => state.records.history.filter((h) => h.sessionId === id && !h.first);

  // ---------- progression suggestion (advice only; never changes the user's weights)
  function suggestion(e, s, fmtW) {
    const ex = curEx(e), t = curTarget(e);
    const last = lastPerformance(ex.id, s.startedAt);
    if (!last) return null;
    const sets = last.sets;
    const when = last.session.localDate;
    if (ex.kind === "time") {
      const min = Math.min(...sets.map((x) => x.r || 0));
      return min >= t.repsMax
        ? { text: `You held ${sets.length} × ${min}+ s last session (${when}). If your form stayed solid, try adding 5–10 s per hold.`, when }
        : { text: `Last session (${when}): ${sets.map((x) => x.r + " s").join(", ")}. Aim to build toward ${t.repsMax} s per hold.`, when };
    }
    const top = Math.max(...sets.map((x) => x.w || 0));
    const atTop = sets.filter((x) => (x.w || 0) === top);
    const reps = atTop.map((x) => x.r || 0);
    const minReps = Math.min(...reps);
    const wTxt = top > 0 ? ` at ${fmtW(top)}` : "";
    if (atTop.length >= t.sets && minReps >= t.repsMax) {
      return { text: `You completed ${atTop.length} × ${minReps}${wTxt} last session (${when}). Consider increasing the weight slightly next session if your form was good.`, up: true, when };
    }
    if (minReps < t.repsMin) {
      return { text: `Last session (${when}) you did ${reps.join(", ")} reps${wTxt}. Some sets fell below ${t.repsMin} reps, so consider staying at this weight (or going slightly lighter) until every set reaches ${t.repsMin}+.`, when };
    }
    return { text: `Last session (${when}): ${reps.join(", ")} reps${wTxt}. Try to add a rep or two at the same weight before increasing — target is ${t.repsMax} reps on every set.`, when };
  }

  // ---------- units
  const unit = () => state.profile.units;
  const toDisplay = (kg) => (kg === null || kg === undefined ? null : unit() === "lb" ? kg / LB : kg);
  const fromDisplay = (v) => { const n = num(v); return n === null ? null : unit() === "lb" ? n * LB : n; };

  // ---------- import / export
  function exportJSON() { flush(); return JSON.stringify(Object.assign({}, state, { exportedAt: new Date().toISOString() }), null, 2); }

  function validateImport(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: "The file isn't valid JSON." }; }
    if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "The file doesn't contain a backup object." };
    if (data.app !== APP) return { ok: false, error: "This file isn't a Gym Tracker backup (missing app identifier)." };
    if (typeof data.schema !== "number" || data.schema > SCHEMA) return { ok: false, error: "This backup is from an unsupported version (schema " + data.schema + ")." };
    if (!Array.isArray(data.sessions)) return { ok: false, error: "The backup has no workout list." };
    if (data.templates !== undefined && !Array.isArray(data.templates)) return { ok: false, error: "Workout templates in the backup are malformed." };
    const bad = data.sessions.filter((s) => !validSession(s)).length;
    const norm = normalize(clone(data));
    return {
      ok: true, data: norm, dropped: bad,
      summary: { sessions: norm.sessions.filter((s) => s.status === "completed").length, active: norm.activeSessionId ? 1 : 0, custom: Object.keys(norm.customExercises).length, savedAt: data.savedAt || data.exportedAt || null },
    };
  }
  function replaceAll(newState) {
    try { const prev = localStorage.getItem(KEY); if (prev) localStorage.setItem(KEY + ":before-import", prev); } catch (e) { /* best effort */ }
    state = newState;
    recomputeRecords();
    return save();
  }
  // Take over state from another copy (cloud sync) without the import backup step.
  function adopt(raw) {
    state = normalize(raw);
    recomputeRecords();
    return save();
  }
  function clearAll() {
    state = defaults();
    try { localStorage.removeItem(KEY); localStorage.removeItem(KEY + ":before-import"); } catch (e) { /* ignore */ }
    recomputeRecords();
    return save();
  }

  function csvEscape(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const r2 = (v) => (v === null || v === undefined ? "" : Math.round(v * 100) / 100);
  function historyCSV() {
    const rows = [["session_id", "local_date", "started_at", "ended_at", "day", "workout", "duration_min", "intensity", "met", "body_weight_kg", "est_kcal_gross", "est_kcal_active", "exercises_completed", "exercises_skipped", "sets_completed", "volume_kg", "personal_bests"]];
    completedSorted().forEach((s) => {
      const st = sessionStats(s);
      rows.push([s.id, s.localDate, s.startedAt, s.endedAt, "Day " + (s.dayNumber || ""), s.dayName, r2(s.durationMin), s.intensity, MET[s.intensity], r2(s.bodyWeightKg),
        s.calories ? Math.round(s.calories.gross) : "", s.calories ? Math.round(s.calories.active) : "", st.exDone, st.exSkipped, st.sets, r2(st.volume), sessionPRs(s.id).length]);
    });
    return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  }
  function setsCSV() {
    const rows = [["session_id", "local_date", "workout", "exercise", "variant", "equipment", "weight_meaning", "set_no", "extra_set", "weight_kg", "reps_or_seconds", "unit", "rpe", "done", "set_skipped", "exercise_skipped"]];
    completedSorted().forEach((s) => s.exercises.forEach((e) => {
      const ex = curEx(e);
      curSets(e).forEach((x, i) => rows.push([s.id, s.localDate, s.dayName, ex.name, e.variant === "alt" ? "free-weight" : "machine", ex.equipment, ex.load, i + 1, x.extra ? 1 : 0, r2(x.w), x.r, ex.kind === "time" ? "seconds" : "reps", x.rpe, x.done ? 1 : 0, x.skipped ? 1 : 0, e.skipped ? 1 : 0]));
    }));
    return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  }
  const completedSorted = () => state.sessions.filter((s) => s.status === "completed").sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  window.GT = {
    KEY, MET, LB, E1RM_MAX_REPS, BUILTIN, PROGRAM,
    get state() { return state; },
    load, save, saveSoon, flush, onSave: (fn) => listeners.push(fn), lastSaveError: () => lastSaveError,
    uid, num, clone, localDate, parseLocal, addDays, weekStart,
    exercise, allExercises, isModified, defaultSlot, slotModified, template, slotUsage, targetFor, snap, buildSets, midReps,
    startSession, session, activeSession, elapsedMs, togglePause, finishSession, updateCompletedMeta, discardSession,
    curSets, curEx, curTarget, doneSets, exStatus, exVolume, e1rm, sessionStats, aggregate,
    calories, liveCalories, totals, recomputeRecords, pendingRecords, sessionPRs, suggestion, lastPerformance, completedSorted,
    unit, toDisplay, fromDisplay, exportJSON, validateImport, replaceAll, adopt, clearAll, historyCSV, setsCSV,
  };
})();
