/* UI: hash router, views, and event handling. State and maths live in store.js (window.GT). */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const view = $("#view");
  const S = () => GT.state;

  // ---------- formatting
  const esc = (v) => String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const round = (v, d = 2) => (v === null || v === undefined ? null : +(+v).toFixed(d));
  const U = () => GT.unit();
  const wNum = (kg) => (kg === null || kg === undefined ? "" : String(round(GT.toDisplay(kg), 2)));
  const fmtW = (kg) => (kg === null || kg === undefined ? "—" : `${round(GT.toDisplay(kg), 1)} ${U()}`);
  const fmtVol = (kg) => `${Math.round(GT.toDisplay(kg)).toLocaleString()} ${U()}`;
  const fmtKcal = (n) => (n === null || n === undefined ? "—" : `≈ ${Math.round(n).toLocaleString()} kcal`);
  const kcalNum = (n) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString());
  function fmtClock(ms) {
    const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
  }
  function fmtMin(min) {
    if (min === null || min === undefined || isNaN(min)) return "—";
    const m = Math.round(min);
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  }
  const fmtDay = (ld, opts) => GT.parseLocal(ld).toLocaleDateString(undefined, opts || { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const today = () => GT.localDate(new Date());
  const icon = (id, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const variantLabel = (v) => (v === "alt" ? "Free-weight alternative" : "Main option");
  const EQUIP = { machine: "Machine", cable: "Cable", dumbbell: "Dumbbell", bodyweight: "Bodyweight" };
  const LOAD_HEAD = { stack: "kg", "per-dumbbell": "kg/DB", total: "kg", bodyweight: "+kg" };
  const LOAD_NOTE = {
    stack: "Weight = the machine stack or plates you select.",
    "per-dumbbell": "Weight = ONE dumbbell (the number on each dumbbell). Volume and 1RM use this number.",
    total: "Weight = the single dumbbell or total load you hold.",
    bodyweight: "Weight = added load only (leave 0 for bodyweight).",
  };
  const loadHead = (ex) => (LOAD_HEAD[ex.load] || "kg").replace("kg", U());
  const INTENSITY = { light: "Light (3.0 MET)", moderate: "Moderate (3.5 MET)", vigorous: "Vigorous (6.0 MET)" };
  const PR_LABEL = { maxW: "Heaviest set", e1rm: "Est. 1RM", volume: "Session volume", maxTime: "Longest hold", repsAt: "Most reps" };
  function prValue(h, v = h.value) {
    if (h.type === "maxTime") return `${Math.round(v)} s`;
    if (h.type === "volume") return fmtVol(v);
    if (h.type === "repsAt") return `${v} reps @ ${h.w > 0 ? fmtW(h.w) : "bodyweight"}`;
    if (h.type === "maxW") return fmtW(v);
    return fmtW(v);
  }

  // ---------- images
  function imageSources(ex) {
    if (ex.imageUrl) return [ex.imageUrl];
    // The single-file build embeds photos in window.GT_IMAGES; otherwise they load from img/.
    const src = (f) => (window.GT_IMAGES && window.GT_IMAGES[f]) || "img/" + f;
    if (ex.image && ex.image.id) return [src(`${ex.image.id}/0.jpg`), src(`${ex.image.id}/1.jpg`)];
    return [];
  }
  function thumb(ex, opts = {}) {
    const src = imageSources(ex)[0];
    const similar = !ex.imageUrl && ex.image && !ex.image.exact;
    const fb = `<div class="fallback"${src ? " hidden" : ""}>${icon(ex.equipment === "dumbbell" ? "dumbbell" : "machine")}<span>${esc(ex.name)}</span></div>`;
    return `<button type="button" class="thumb" data-action="lightbox" data-ex="${esc(ex.id)}" aria-label="Enlarge reference image for ${esc(ex.name)}">
      ${src ? `<img src="${esc(src)}" alt="${esc(ex.name)} reference photo${similar ? " (similar movement)" : ""}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ""}
      ${fb}${similar && !opts.noTag ? `<span class="tag">Similar</span>` : ""}</button>`;
  }
  window.addEventListener("error", (e) => { if (e.target && e.target.tagName === "IMG") e.target.hidden = true; }, true);

  // ---------- toasts, dialogs
  function toast(html, kind = "", ms = 3200) {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.innerHTML = html;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  const modal = $("#modal"), modalForm = $("#modalForm");
  let modalResolve = null, modalValidate = null, lastSubmitter = null;
  modalForm.addEventListener("click", (e) => { const b = e.target.closest("button[value]"); if (b) lastSubmitter = b; });
  modalForm.addEventListener("submit", (e) => {
    const sub = e.submitter || lastSubmitter || {};
    const value = sub.value || "ok";
    if (modalValidate && value !== "cancel" && !(sub.dataset && sub.dataset.novalidate)) {
      const err = modalValidate(modalForm, value);
      if (err) { e.preventDefault(); const box = $(".m-err", modalForm); if (box) { box.textContent = err; box.hidden = false; } }
    }
  });
  modal.addEventListener("close", () => {
    const r = modalResolve; modalResolve = null; modalValidate = null; lastSubmitter = null;
    const value = modal.returnValue && modal.returnValue !== "cancel" ? modal.returnValue : null;
    const data = {};
    $$("[name]", modalForm).forEach((el) => { data[el.name] = el.type === "checkbox" ? el.checked : el.value; });
    if (r) r({ value, data });
  });
  function openModal({ title, body = "", actions, validate, onOpen, wide }) {
    if (modal.open) modal.close("cancel");
    modalForm.innerHTML = `<div class="m-head"><h2>${esc(title)}</h2><button type="button" class="btn icon sm ghost" aria-label="Close" data-close>${icon("x")}</button></div>
      <div class="stack">${body}</div><p class="err-text m-err" role="alert" hidden></p>
      <div class="m-actions"><button value="${esc(actions[actions.length - 1].value)}" hidden tabindex="-1" aria-hidden="true"></button>${actions.map((a) => `<button class="btn ${a.cls || ""}" value="${esc(a.value)}"${a.novalidate ? " data-novalidate=1" : ""}>${esc(a.label)}</button>`).join("")}</div>`;
    $("[data-close]", modalForm).onclick = () => modal.close("cancel");
    modalValidate = validate || null;
    modalForm.oninput = null;
    modal.returnValue = "";
    modal.style.width = wide ? "min(720px, calc(100vw - 24px))" : "";
    return new Promise((res) => {
      modalResolve = res;
      modal.showModal();
      if (onOpen) onOpen(modalForm);
    });
  }
  async function confirmDialog(title, message, okLabel = "Confirm", danger = false) {
    const r = await openModal({ title, body: `<p>${message}</p>`, actions: [{ label: "Cancel", value: "cancel", cls: "ghost" }, { label: okLabel, value: "ok", cls: danger ? "danger" : "primary" }] });
    return r.value === "ok";
  }

  function lightbox(ex) {
    const srcs = imageSources(ex);
    const credit = ex.imageUrl ? "Custom image URL you added." : ex.image
      ? `Photo: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">Free Exercise DB</a> (public domain).${ex.image.exact ? "" : " " + esc(ex.image.note)}`
      : "No reference image. Add an image URL in the Exercise Library.";
    $("#lightboxBody").innerHTML = `<figure>
      ${srcs.length ? `<div class="lb-imgs ${srcs.length > 1 ? "two" : ""}">${srcs.map((s, i) => `<img src="${esc(s)}" alt="${esc(ex.name)} — ${srcs.length > 1 ? (i ? "end position" : "start position") : "reference"}" onerror="this.hidden=true">`).join("")}</div>` : `<div class="thumb" style="cursor:default">${thumb(ex).replace(/<\/?button[^>]*>/g, "")}</div>`}
      <figcaption><strong>${esc(ex.name)}</strong>${srcs.length > 1 ? `<span class="muted">Left/top: start position · right/bottom: end position.</span>` : ""}<span class="muted">${credit}</span></figcaption></figure>`;
    $("#lightbox").showModal();
  }
  $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox" || e.target.closest("[data-action=lightbox-close]")) $("#lightbox").close(); });

  // ---------- save warnings
  GT.onSave((err) => { const b = $("#saveWarn"); b.hidden = !err; b.textContent = err ? "⚠ " + err : ""; });

  // ---------- rest timer (state.restTimer is persisted so a refresh keeps it)
  let audioCtx = null;
  function unlockAudio() {
    try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch (e) { audioCtx = null; }
  }
  function beep() {
    if (!S().settings.restSound || !audioCtx) return;
    try {
      [0, 0.22].forEach((t) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880; g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.18);
        o.connect(g).connect(audioCtx.destination); o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.2);
      });
    } catch (e) { /* ignore */ }
  }
  const rest = {
    start(sec, label) {
      S().restTimer = { total: sec * 1000, endsAt: Date.now() + sec * 1000, remaining: null, paused: false, label, alerted: false };
      GT.saveSoon(); rest.paint();
    },
    remaining() { const r = S().restTimer; if (!r) return 0; return r.paused ? r.remaining : r.endsAt - Date.now(); },
    pause() {
      const r = S().restTimer; if (!r) return;
      if (r.paused) { r.endsAt = Date.now() + r.remaining; r.paused = false; r.remaining = null; }
      else { r.remaining = Math.max(0, r.endsAt - Date.now()); r.paused = true; }
      GT.saveSoon(); rest.paint();
    },
    reset() { const r = S().restTimer; if (!r) return; Object.assign(r, { endsAt: Date.now() + r.total, paused: false, remaining: null, alerted: false }); GT.saveSoon(); rest.paint(); },
    add(sec) { const r = S().restTimer; if (!r) return; if (r.paused) r.remaining += sec * 1000; else r.endsAt = Math.max(r.endsAt, Date.now()) + sec * 1000; r.total += sec * 1000; r.alerted = false; GT.saveSoon(); rest.paint(); },
    close() { S().restTimer = null; GT.saveSoon(); rest.paint(); },
    paint() {
      const r = S().restTimer, bar = $("#restBar");
      if (!r || !GT.activeSession()) { bar.hidden = true; return; }
      bar.hidden = false;
      const left = rest.remaining();
      const over = left <= 0;
      if (over && !r.alerted) {
        r.alerted = true; GT.saveSoon(); beep();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
      if (over && -left > 90000) { rest.close(); return; }
      bar.classList.toggle("over", over);
      $("#restTime").textContent = over ? "Go!" : fmtClock(left + 999);
      $("#restLabel").textContent = over ? "Rest done · " + (r.label || "") : (r.paused ? "Paused · " : "Rest · ") + (r.label || "");
      $("#restPause").textContent = r.paused ? "Resume" : "Pause";
      $("#restPause").disabled = over;
      $("#restFill").style.width = (over ? 100 : Math.max(0, Math.min(100, 100 - (left / r.total) * 100))) + "%";
    },
  };

  // ---------- router
  let route = { name: "dashboard", params: [] };
  function parseRoute() {
    const parts = (location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean);
    return { name: parts[0] || "dashboard", params: parts.slice(1) };
  }
  const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
  window.addEventListener("hashchange", () => { GT.flush(); render(true); });

  const NAV_FOR = { dashboard: "dashboard", workouts: "workouts", session: "workouts", edit: "history", records: "records", history: "history", library: "library", profile: "profile" };
  function render(scrollTop) {
    route = parseRoute();
    const fn = VIEWS[route.name] || VIEWS.dashboard;
    $$(".nav a[data-nav]").forEach((a) => { if (a.dataset.nav === NAV_FOR[route.name]) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    view.innerHTML = fn(...route.params);
    if (afterRender) { const f = afterRender; afterRender = null; f(); }
    if (scrollTop) window.scrollTo(0, 0);
    rest.paint();
  }
  let afterRender = null;

  // ---------- shared calculations for views
  function weekInfo() {
    const t = today(), ws = GT.weekStart(t), we = GT.addDays(ws, 6);
    return { t, ws, we, tot: GT.totals(ws, we, S().settings.includeActiveInTotals) };
  }
  function dayState(dayId, ws, we) {
    const act = GT.activeSession();
    if (act && act.dayId === dayId) return { status: "active", pct: GT.sessionStats(act).pct, session: act };
    const done = S().sessions.filter((s) => s.status === "completed" && s.dayId === dayId && s.localDate >= ws && s.localDate <= we)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    if (done.length) return { status: "done", pct: Math.max(...done.map((x) => GT.sessionStats(x).pct)), session: done[0], count: done.length };
    return { status: "todo", pct: 0 };
  }
  function suggestedDay(ws, we) {
    const t = S().templates;
    return t.find((d) => dayState(d.id, ws, we).status === "todo") || t[0];
  }
  function planned(min) {
    const kg = S().profile.bodyWeightKg;
    return GT.calories(GT.MET[S().settings.defaultIntensity], kg, min);
  }

  // ---------- charts (inline SVG, single series, hover tooltips)
  function barChart(data, { h = 150, fmt = (v) => v } = {}) {
    const W = 600, H = h, L = 28, B = 26, T = 10;
    const max = Math.max(1, ...data.map((d) => d.value));
    const step = max <= 5 ? 1 : Math.ceil(max / 4);
    const top = Math.ceil(max / step) * step;
    const bw = (W - L) / data.length;
    const y = (v) => T + (H - T - B) * (1 - v / top);
    let g = "";
    for (let v = 0; v <= top; v += step) g += `<line class="grid-line" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-text" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    data.forEach((d, i) => {
      const x = L + i * bw + bw * 0.22, w = bw * 0.56, yy = y(d.value), hh = Math.max(0, H - B - yy);
      const r = Math.min(4, w / 2, hh);
      g += d.value > 0
        ? `<path class="bar ${d.dim ? "dim" : ""}" d="M${x},${H - B} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + w - r} Q${x + w},${yy} ${x + w},${yy + r} V${H - B} Z"/>`
        : "";
      g += `<text class="axis-text" x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
      g += `<rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" data-tip="${esc(d.tip || fmt(d.value))}" data-tx="${x + w / 2}" data-ty="${yy}"/>`;
    });
    return `<div class="chart" data-w="${W}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">${g}</svg><div class="tooltip" hidden></div></div>`;
  }
  function lineChart(points, { h = 190, fmtY = (v) => v } = {}) {
    if (points.length < 2) return `<div class="empty">The progression line appears after two sessions with this exercise.</div>`;
    const W = 600, H = h, L = 44, R = 10, T = 12, B = 26;
    const ys = points.map((p) => p.y);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const padv = Math.max((hi - lo) * 0.15, hi * 0.05, 1); lo = Math.max(0, lo - padv); hi += padv;
    const x = (i) => L + (W - L - R) * (points.length === 1 ? 0.5 : i / (points.length - 1));
    const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    let g = "";
    for (let k = 0; k <= 3; k++) { const v = lo + ((hi - lo) * k) / 3; g += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-text" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmtY(v))}</text>`; }
    g += `<path class="line" d="${points.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p.y).toFixed(1)).join(" ")}"/>`;
    const every = Math.ceil(points.length / 6);
    points.forEach((p, i) => {
      if (i % every === 0 || i === points.length - 1) g += `<text class="axis-text" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>`;
    });
    points.forEach((p, i) => { g += `<circle class="dot" cx="${x(i)}" cy="${y(p.y)}" r="4.5"/>`; });
    const bw = (W - L - R) / Math.max(1, points.length - 1);
    points.forEach((p, i) => { g += `<rect class="hit" x="${x(i) - bw / 2}" y="${T}" width="${bw}" height="${H - T - B}" data-tip="${esc(p.tip)}" data-tx="${x(i)}" data-ty="${y(p.y)}"/>`; });
    return `<div class="chart" data-w="${W}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">${g}</svg><div class="tooltip" hidden></div></div>`;
  }
  function chartHover(e) {
    const hit = e.target.closest && e.target.closest(".chart .hit");
    $$(".chart .tooltip").forEach((t) => { if (!hit || !t.parentNode.contains(hit)) t.hidden = true; });
    if (!hit) return;
    const chart = hit.closest(".chart"), tip = $(".tooltip", chart), svg = $("svg", chart);
    const scale = svg.getBoundingClientRect().width / +chart.dataset.w;
    tip.innerHTML = hit.dataset.tip;
    tip.hidden = false;
    let left = +hit.dataset.tx * scale;
    const half = tip.offsetWidth / 2;
    left = Math.max(half, Math.min(chart.clientWidth - half, left));
    tip.style.left = left + "px";
    tip.style.top = +hit.dataset.ty * scale + "px";
  }
  document.addEventListener("pointerover", chartHover);
  document.addEventListener("pointerdown", chartHover);

  // =====================================================================
  // VIEWS
  // =====================================================================
  const VIEWS = {};

  // ---------- Dashboard
  VIEWS.dashboard = function () {
    const { t, ws, we, tot } = weekInfo();
    const days = S().templates;
    const act = GT.activeSession();
    const doneDays = days.filter((d) => dayState(d.id, ws, we).status === "done").length;
    const next = suggestedDay(ws, we);
    const ms = t.slice(0, 8) + "01", me = GT.localDate(new Date(+t.slice(0, 4), +t.slice(5, 7), 0));
    const month = GT.totals(ms, me, S().settings.includeActiveInTotals);
    const C = 2 * Math.PI * 44, frac = days.length ? doneDays / days.length : 0;
    const prs = S().records.history.filter((h) => !h.first).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const last = GT.completedSorted().slice(-1)[0];
    const noWeight = !S().profile.bodyWeightKg;

    // Consistency: completed workouts per week, last 8 weeks.
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const a = GT.addDays(ws, -7 * i), b = GT.addDays(a, 6);
      const n = S().sessions.filter((s) => s.status === "completed" && s.localDate >= a && s.localDate <= b).length;
      weeks.push({ label: i === 0 ? "This" : fmtDay(a, { day: "numeric", month: "numeric" }), value: n, tip: `<b>${plural(n, "workout")}</b><br>week of ${fmtDay(a, { day: "numeric", month: "short" })}`, dim: false });
    }

    return `
    <div class="page-head"><div><h1>This week</h1><p class="muted small">${fmtDay(ws, { day: "numeric", month: "short" })} – ${fmtDay(we, { day: "numeric", month: "short" })} · weeks start Monday</p></div></div>
    ${noWeight ? `<div class="banner warn">Add your body weight in <a href="#/profile">Profile</a> so calorie estimates can be calculated.</div>` : ""}
    <section class="card hero" aria-label="Weekly progress">
      <div class="ring" role="img" aria-label="${doneDays} of ${days.length} workout days completed this week">
        <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="44" fill="none" stroke-width="10"/><circle class="bar" cx="50" cy="50" r="44" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
        <div class="center"><strong>${doneDays}/${days.length}</strong><span>days done</span></div>
      </div>
      <div class="stack">
        <div><h2>${doneDays === days.length ? "All workout days done this week 🎉" : `${days.length - doneDays} workout day${days.length - doneDays === 1 ? "" : "s"} to go`}</h2>
        <p class="muted small">${plural(tot.workouts, "completed workout")} this week</p></div>
        <div class="hero-actions">
          ${act ? `<a class="btn primary lg" href="#/session">${icon("play")} Resume Day ${act.dayNumber} · <span data-elapsed="${act.id}">${fmtClock(GT.elapsedMs(act))}</span></a>` : ""}
          <button type="button" class="btn ${act ? "" : "primary"} lg" data-action="start" data-day="${next.id}">${icon("dumbbell")} Start today's workout: Day ${days.indexOf(next) + 1}</button>
        </div>
      </div>
    </section>
    <section class="stats" aria-label="Weekly totals">
      <div class="stat"><div class="label">Workouts completed</div><div class="value">${tot.workouts}</div><div class="sub">${doneDays}/${days.length} programme days</div></div>
      <div class="stat"><div class="label">Exercises completed</div><div class="value">${tot.exercises}</div><div class="sub">${plural(tot.sets, "set")} done</div></div>
      <div class="stat"><div class="label">Est. calories (week)</div><div class="value">${kcalNum(tot.kcal)}<small>kcal</small></div><div class="sub">≈ estimate · month ${kcalNum(month.kcal)} kcal</div></div>
      <div class="stat"><div class="label">Workout time</div><div class="value">${fmtMin(tot.minutes)}</div><div class="sub">volume ${fmtVol(tot.volume)}</div></div>
    </section>
    ${tot.missingKcal ? `<p class="note">${plural(tot.missingKcal, "workout")} this week had no body weight, so no calorie estimate is included.</p>` : ""}
    <div class="section-title"><h2>Workout days</h2><a class="small" href="#/workouts">Manage</a></div>
    <section class="days">${days.map((d, i) => dayCard(d, i, ws, we)).join("")}</section>
    <div class="grid grid-2-lg">
      <section class="card"><div class="row between"><h2>Latest workout</h2>${last ? `<a class="small" href="#/history/${last.id}">Details</a>` : ""}</div>${last ? latestSummary(last) : `<div class="empty"><strong>No workouts yet</strong>Finish a workout and its summary appears here.</div>`}</section>
      <section class="card"><div class="row between"><h2>Recent personal bests</h2><a class="small" href="#/records">All records</a></div>
        ${prs.length ? `<div class="list">${prs.map(prRow).join("")}</div>` : `<div class="empty"><strong>No personal bests yet</strong>Your first session with an exercise sets the baseline. Beat it next time to earn a PB.</div>`}</section>
    </div>
    <section class="card"><h2>Consistency</h2><p class="muted small">Completed workouts per week (last 8 weeks)</p>${barChart(weeks)}</section>`;
  };
  function dayCard(d, i, ws, we) {
    const st = dayState(d.id, ws, we);
    const chip = st.status === "done" ? `<span class="chip done">${icon("check")} Done${st.count > 1 ? " ×" + st.count : ""}</span>` : st.status === "active" ? `<span class="chip progress">In progress</span>` : `<span class="chip">Not started</span>`;
    return `<a class="card day-card ${st.status === "done" ? "is-done" : st.status === "active" ? "is-active" : ""}" href="#/workouts/${d.id}">
      <div class="row between nowrap"><span class="day-num">Day ${i + 1}</span>${chip}</div>
      <div><h3>${esc(d.name)}</h3><p class="muted small">${esc(d.muscles.join(" · "))} · ${plural(d.slots.length, "exercise")}</p></div>
      <div class="row nowrap"><div class="progress grow ${st.pct >= 100 ? "done" : ""}" role="progressbar" aria-valuenow="${st.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Day ${i + 1} progress"><span style="width:${st.pct}%"></span></div><span class="small num">${st.pct}%</span></div>
    </a>`;
  }
  function latestSummary(s) {
    const st = GT.sessionStats(s), prs = GT.sessionPRs(s.id);
    return `<p class="muted small">${fmtDay(s.localDate, { weekday: "long", day: "numeric", month: "short" })} · Day ${s.dayNumber}: ${esc(s.dayName)}</p>
      <dl class="kv" style="margin-top:10px">
        <div><dt>Duration</dt><dd>${fmtMin(s.durationMin)}</dd></div>
        <div><dt>Est. calories</dt><dd>${s.calories ? fmtKcal(s.calories.gross) : "—"}</dd></div>
        <div><dt>Exercises</dt><dd>${st.exDone}/${st.exTotal}</dd></div>
        <div><dt>Sets</dt><dd>${st.sets}</dd></div>
        <div><dt>Volume</dt><dd>${fmtVol(st.volume)}</dd></div>
        <div><dt>PBs</dt><dd>${prs.length}</dd></div>
      </dl>`;
  }
  function prRow(h) {
    return `<div class="row between nowrap"><div class="grow"><div class="row" style="gap:6px"><span class="pb-badge">PB</span><strong>${esc(h.name)}</strong></div>
      <div class="small muted">${PR_LABEL[h.type]}: ${h.prev !== null ? `${esc(prValue(h, h.prev))} → ` : ""}<b style="color:var(--ink)">${esc(prValue(h))}</b></div></div>
      <span class="small muted">${fmtDay(h.localDate || GT.localDate(h.date), { day: "numeric", month: "short" })}</span></div>`;
  }

  // ---------- Workouts
  VIEWS.workouts = function (dayId) {
    if (dayId) return dayView(dayId);
    const { ws, we } = weekInfo();
    const act = GT.activeSession();
    return `<div class="page-head"><div><h1>Workouts</h1><p class="muted small">Start any day in any order. Each exercise has a machine and a free-weight option.</p></div></div>
      ${act ? `<a class="card row between nowrap" href="#/session" style="text-decoration:none;color:inherit;border-color:var(--accent)"><div><span class="chip progress">In progress</span><h3 style="margin-top:6px">Day ${act.dayNumber}: ${esc(act.dayName)}</h3><p class="small muted">Elapsed <span data-elapsed="${act.id}">${fmtClock(GT.elapsedMs(act))}</span> · ${GT.sessionStats(act).pct}% done</p></div><span class="btn primary">Resume</span></a>` : ""}
      <section class="days">${S().templates.map((d, i) => dayCard(d, i, ws, we)).join("")}</section>`;
  };
  function dayView(dayId) {
    const d = GT.template(dayId);
    if (!d) return notFound("That workout day doesn't exist.");
    const idx = S().templates.indexOf(d);
    const act = GT.activeSession();
    const def = GT.PROGRAM.find((p) => p.id === dayId);
    const dayModified = def && (def.slots.length !== d.slots.length || d.slots.some((s, i) => !def.slots[i] || def.slots[i].id !== s.id || GT.slotModified(s)));
    const plan = planned(S().profile.defaultDurationMin);
    return `<div class="page-head"><div><a href="#/workouts" class="small">${icon("back")} Workouts</a><h1 style="margin-top:6px">Day ${idx + 1}: ${esc(d.name)}</h1>
      <p class="muted small">${esc(d.muscles.join(" · "))}</p></div></div>
      <div class="card stack">
        ${act && act.dayId === dayId ? `<a class="btn primary lg block" href="#/session">${icon("play")} Resume this workout</a>` : `<button class="btn primary lg block" data-action="start" data-day="${dayId}">${icon("play")} Start Day ${idx + 1}</button>`}
        <p class="note">${plan ? `Planned estimate for a ${S().profile.defaultDurationMin}-minute session at ${S().settings.defaultIntensity} intensity: ≈ ${Math.round(plan.gross)} kcal. The real estimate uses your recorded workout time.` : "Add your body weight in Profile to see calorie estimates."}</p>
      </div>
      <div class="section-title"><h2>Exercises</h2><span class="small muted">Template edits don't change past workouts</span></div>
      <section class="card"><div class="list">${d.slots.map((s, i) => slotRow(d, s, i)).join("") || `<div class="empty">No exercises in this day.</div>`}</div></section>
      <div class="row"><button class="btn" data-action="slot-add" data-day="${dayId}">${icon("plus")} Add exercise</button>
      ${dayModified ? `<button class="btn ghost" data-action="day-reset" data-day="${dayId}">Reset day to programme defaults</button>` : ""}</div>`;
  }
  function slotRow(d, s, i) {
    const p = GT.exercise(s.primary), a = s.alt ? GT.exercise(s.alt) : null;
    const tp = GT.targetFor(s, "primary"), ta = GT.targetFor(s, "alt");
    const unitTxt = (ex, t) => (ex && ex.kind === "time" ? "s" : "reps") + (t.perSide ? " per side" : "");
    return `<div class="slot-row" style="grid-template-columns: 30px minmax(0,1fr) auto">
      <span class="ex-num">${i + 1}</span>
      <div class="grow"><strong>${esc(p ? p.name : "Missing exercise")}</strong>${GT.slotModified(s) ? ` <span class="chip info">Edited</span>` : ""}${!GT.defaultSlot(s.id) ? ` <span class="chip info">Custom</span>` : ""}
        <div class="small muted">${s.sets} × ${tp.repsMin}–${tp.repsMax} ${unitTxt(p, tp)} · rest ${esc(tp.restLabel)}</div>
        <div class="small muted">Alternative: ${a ? esc(a.name) + (ta.repsMin !== tp.repsMin || ta.repsMax !== tp.repsMax ? ` (${ta.repsMin}–${ta.repsMax} ${unitTxt(a, ta)})` : "") : "none"}</div></div>
      <div class="row nowrap" style="gap:2px">
        <button class="btn icon sm ghost" data-action="slot-move" data-day="${d.id}" data-i="${i}" data-dir="-1" aria-label="Move ${esc(p ? p.name : "")} up" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="btn icon sm ghost" data-action="slot-move" data-day="${d.id}" data-i="${i}" data-dir="1" aria-label="Move ${esc(p ? p.name : "")} down" ${i === d.slots.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn icon sm" data-action="slot-edit" data-day="${d.id}" data-slot="${s.id}" aria-label="Edit ${esc(p ? p.name : "")}">${icon("edit")}</button>
      </div></div>`;
  }

  // ---------- Session (active workout) and edit mode for completed workouts
  const ui = { open: {}, announced: {} };
  VIEWS.session = function () {
    const s = GT.activeSession();
    if (!s) return `<div class="empty"><strong>No workout in progress</strong>Start one from the <a href="#/">dashboard</a> or <a href="#/workouts">Workouts</a>.</div>`;
    return sessionView(s, "active");
  };
  VIEWS.edit = function (id) {
    const s = GT.session(id);
    if (!s || s.status !== "completed") return notFound("That workout couldn't be found.");
    return sessionView(s, "edit");
  };
  function openSet(s) {
    if (!ui.open[s.id]) {
      const first = s.exercises.findIndex((e) => !["done", "skipped"].includes(GT.exStatus(e)));
      ui.open[s.id] = new Set([first < 0 ? 0 : first]);
    }
    return ui.open[s.id];
  }
  function announcedFor(s) {
    if (!ui.announced[s.id]) {
      ui.announced[s.id] = new Set();
      const pr = GT.pendingRecords(s).byEntry;
      Object.keys(pr).forEach((i) => pr[i].forEach((f) => ui.announced[s.id].add(prKey(i, f))));
    }
    return ui.announced[s.id];
  }
  const prKey = (i, f) => `${i}:${f.exId}:${f.type}:${f.type === "repsAt" ? f.w : ""}:${f.value}`;

  function sessionView(s, mode) {
    const st = GT.sessionStats(s);
    const live = mode === "active";
    const kc = live ? GT.liveCalories(s) : s.calories;
    announcedFor(s);
    const prs = GT.pendingRecords(s).byEntry;
    return `<header class="sess-head">
      <div class="row between nowrap">
        <div class="grow"><div class="title">${live ? "" : "Editing · "}Day ${s.dayNumber}: ${esc(s.dayName)}</div>
          <div class="small muted">${live ? `Started ${fmtTime(s.startedAt)}` : fmtDateTime(s.startedAt)}</div></div>
        ${live ? `<span class="elapsed ${s.pausedAt ? "paused" : ""}" data-elapsed="${s.id}" aria-label="Elapsed time">${fmtClock(GT.elapsedMs(s))}</span>
          <button class="btn icon" data-action="sess-pause" aria-label="${s.pausedAt ? "Resume workout timer" : "Pause workout timer"}">${icon(s.pausedAt ? "play" : "pause")}</button>
          <button class="btn primary" data-action="sess-finish">Finish</button>`
        : `<span class="elapsed">${fmtMin(s.durationMin)}</span><a class="btn primary" href="#/history/${s.id}">Done</a>`}
      </div>
      <div class="row nowrap"><div class="progress grow ${st.pct >= 100 ? "done" : ""}" role="progressbar" aria-label="Workout progress" aria-valuenow="${st.pct}" aria-valuemin="0" aria-valuemax="100"><span id="sessBar" style="width:${st.pct}%"></span></div>
        <span class="small num" id="sessPct">${st.reqDone}/${st.reqSets} sets</span></div>
    </header>
    <div class="sess-meta">
      ${live ? `<label>Intensity <select data-action="sess-intensity" aria-label="Workout intensity">${Object.keys(INTENSITY).map((k) => `<option value="${k}" ${s.intensity === k ? "selected" : ""}>${INTENSITY[k]}</option>`).join("")}</select></label>
        <span>${icon("fire")} <span data-livekcal="${s.id}">${kc ? fmtKcal(kc.gross) : "add body weight in Profile"}</span> <span class="tiny">so far (estimate)</span></span>
        ${s.pausedAt ? `<span class="chip skip">Timer paused</span>` : ""}
        <button class="linkbtn small" data-action="sess-discard">Discard workout</button>`
      : `<span>${INTENSITY[s.intensity]} · ${kc ? fmtKcal(kc.gross) : "no calorie estimate"}</span><button class="linkbtn small" data-action="hist-meta" data-id="${s.id}">Edit duration & calories</button>
        <span class="tiny">Changes save automatically and won't create a new workout.</span>`}
    </div>
    <div class="grid" id="exList">${s.exercises.map((e, i) => exCard(s, e, i, mode, prs[i] || [])).join("")}</div>
    ${live ? `<button class="btn primary lg block" data-action="sess-finish">Finish workout</button>` : ""}`;
  }

  function exCard(s, e, i, mode, prs) {
    const open = openSet(s).has(i);
    const status = GT.exStatus(e), ex = GT.curEx(e), t = GT.curTarget(e), sets = GT.curSets(e);
    const full = GT.exercise(ex.id) || ex;
    const doneN = GT.doneSets(e).length, reqN = sets.filter((x) => !x.extra && !x.skipped).length;
    const chip = status === "done" ? `<span class="chip done">${icon("check")} Done</span>` : status === "skipped" ? `<span class="chip skip">Skipped</span>` : status === "progress" ? `<span class="chip progress">${doneN}/${reqN}</span>` : `<span class="chip">${reqN} sets</span>`;
    const head = `<div class="ex-head" data-action="ex-toggle" data-i="${i}" role="button" tabindex="0" aria-expanded="${open}" aria-controls="exb-${i}">
        <span class="ex-num">${status === "done" ? icon("check") : i + 1}</span>
        <div class="ex-title"><div class="ex-name">${esc(ex.name)}</div><div class="ex-sub">${variantLabel(e.variant)} · ${t.sets} × ${t.repsMin}–${t.repsMax}${ex.kind === "time" ? " s" : ""}${t.perSide ? " /side" : ""}${prs.length ? ` · <span class="pb-badge">PB</span>` : ""}</div></div>
        ${chip}${icon("chev", "chev")}
      </div>`;
    if (!open) return `<article class="card flush ex st-${status}" id="ex-${i}">${head}</article>`;

    const best = (S().records.best || {})[ex.id];
    const kind = ex.kind;
    const sug = GT.suggestion(e, s, fmtW);
    const vol = GT.exVolume(e);
    const exKcal = exerciseKcal(s, e);
    const pbLine = best ? [
      best.maxW ? `Heaviest ${fmtW(best.maxW.value)} × ${best.maxW.reps}` : "",
      best.e1rm ? `e1RM ${fmtW(best.e1rm.value)}` : "",
      best.maxTime ? `Longest ${best.maxTime.value} s` : "",
      best.volume ? `Best volume ${fmtVol(best.volume.value)}` : "",
    ].filter(Boolean).join(" · ") : "";
    const nextIdx = s.exercises.findIndex((x, j) => j > i && !["done", "skipped"].includes(GT.exStatus(x)));

    return `<article class="card flush ex open st-${status}" id="ex-${i}">${head}
      <div class="ex-body" id="exb-${i}">
        ${e.alt ? `<div class="seg" role="group" aria-label="Exercise variant">
          <button type="button" data-action="variant" data-i="${i}" data-v="primary" aria-pressed="${e.variant === "primary"}">Machine<small>${esc(e.primary.name)}</small></button>
          <button type="button" data-action="variant" data-i="${i}" data-v="alt" aria-pressed="${e.variant === "alt"}">Free-weight<small>${esc(e.alt.name)}</small></button></div>` : ""}
        <div class="ex-media">
          ${thumb(full)}
          <div class="stack" style="gap:6px">
            <div class="target"><span><b>${t.sets}</b> sets</span><span><b>${t.repsMin}–${t.repsMax}</b> ${kind === "time" ? "seconds" : "reps"}${t.perSide ? " per side" : ""}</span><span>Rest <b>${esc(t.restLabel)}</b></span></div>
            <div class="small muted">${esc((full.muscles || []).join(" · "))} · ${EQUIP[ex.equipment] || ""}</div>
            <div class="tiny muted">${LOAD_NOTE[ex.load] || ""}</div>
          </div>
        </div>
        ${pbLine || prs.length ? `<div class="pb-line">${prs.map((f) => `<span class="pb-badge" title="${esc(PR_LABEL[f.type])}">PB ${esc(PR_LABEL[f.type])}: ${f.prev !== null ? esc(prValue(f, f.prev)) + " → " : ""}${esc(prValue(f))}</span>`).join(" ")}${pbLine ? `<div class="muted" style="margin-top:4px">${icon("trophy", "")} Records: ${pbLine}</div>` : ""}</div>` : ""}
        ${sug ? `<div class="suggest ${sug.up ? "up" : ""}">${esc(sug.text)}</div>` : ""}
        ${full.technique && full.technique.length ? `<details class="tech"><summary>Technique guide</summary><ol>${full.technique.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>` : ""}
        ${e.skipped ? `<div class="subtle row between"><span>Exercise skipped — its sets don't count.</span><button class="btn sm" data-action="ex-skip" data-i="${i}">Unskip</button></div>` : `
        <div class="sets" role="table" aria-label="Sets for ${esc(ex.name)}">
          <div class="set-headrow" role="row"><span role="columnheader">Set</span><span role="columnheader">${esc(loadHead(ex))}</span><span role="columnheader">${kind === "time" ? "Sec" : "Reps"}</span><span role="columnheader">RPE</span><span role="columnheader">Done</span><span></span></div>
          ${sets.map((x, j) => setRow(i, j, x, ex)).join("")}
        </div>`}
        <div class="ex-foot">
          <div class="stats-inline"><span>Volume <b class="num" id="vol-${i}">${kind === "time" ? "—" : fmtVol(vol)}</b></span><span>${icon("fire")} <span id="kc-${i}">${exKcal ? fmtKcal(exKcal) : "—"}</span></span></div>
          ${e.skipped ? "" : `<label class="complete-box"><span class="tick sm"><input type="checkbox" data-action="ex-complete" data-i="${i}" ${status === "done" ? "checked" : ""} aria-label="Mark ${esc(ex.name)} complete"><span class="box">${icon("check")}</span></span>Exercise complete</label>`}
        </div>
        ${e.skipped ? "" : `<div class="row">
          <button class="btn sm" data-action="set-add" data-i="${i}">${icon("plus")} Add set</button>
          <button class="btn sm ghost" data-action="ex-skip" data-i="${i}">Skip exercise</button>
          ${mode === "active" ? `<button class="btn sm ghost" data-action="rest-start" data-i="${i}">${icon("clock")} Rest ${t.rest}s</button>` : ""}
        </div>`}
        ${status === "done" || status === "skipped" ? `<div class="next-cta"><span>${status === "done" ? "Nice work — exercise complete." : "Skipped."}</span>${nextIdx >= 0 ? `<button class="btn sm primary" data-action="ex-next" data-i="${i}" data-next="${nextIdx}">Next: ${esc(GT.curEx(s.exercises[nextIdx]).name)} ${icon("chev")}</button>` : mode === "active" ? `<button class="btn sm primary" data-action="sess-finish">Finish workout</button>` : ""}</div>` : ""}
      </div></article>`;
  }
  // Exercise kcal: time between first and last completed set plus ~1 minute for the first set. Only an estimate.
  function exerciseKcal(s, e) {
    const times = GT.doneSets(e).map((x) => Date.parse(x.doneAt)).filter((t) => !isNaN(t)).sort((a, b) => a - b);
    if (!times.length) return null;
    const kg = s.status === "active" ? S().profile.bodyWeightKg : s.bodyWeightKg;
    const min = (times[times.length - 1] - times[0]) / 60000 + 1;
    const c = GT.calories(GT.MET[s.intensity], kg, min);
    return c ? c.gross : null;
  }
  function setRow(i, j, x, ex) {
    const dis = x.skipped ? "disabled" : "";
    const lbl = `set ${j + 1}`;
    return `<div class="set-row ${x.done ? "is-done" : ""} ${x.skipped ? "is-skipped" : ""} ${x.extra ? "is-extra" : ""}" role="row" data-i="${i}" data-j="${j}">
      <span class="n" role="cell">${j + 1}</span>
      <input type="number" inputmode="decimal" step="any" min="0" max="2000" data-field="w" value="${esc(wNum(x.w))}" placeholder="${ex.load === "bodyweight" ? "0" : "–"}" aria-label="Weight in ${U()} for ${lbl}" ${dis}>
      <input type="number" inputmode="numeric" step="1" min="0" max="${ex.kind === "time" ? 3600 : 200}" data-field="r" value="${esc(x.r === null ? "" : x.r)}" aria-label="${ex.kind === "time" ? "Seconds" : "Reps"} for ${lbl}" ${dis}>
      <select data-field="rpe" aria-label="RPE (optional) for ${lbl}" ${dis}><option value="">–</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option ${x.rpe === n ? "selected" : ""}>${n}</option>`).join("")}</select>
      <label class="tick"><input type="checkbox" data-action="set-done" ${x.done ? "checked" : ""} ${dis} aria-label="Mark ${lbl} done"><span class="box">${icon("check")}</span></label>
      <button type="button" class="btn icon sm ghost" data-action="set-menu" aria-label="More options for ${lbl}">${icon("dots")}</button>
    </div>`;
  }

  function currentSession() {
    if (route.name === "session") return GT.activeSession();
    if (route.name === "edit") return GT.session(route.params[0]);
    return null;
  }
  const sessMode = () => (route.name === "session" ? "active" : "edit");
  function repaintCard(s, i) {
    const el = document.getElementById("ex-" + i);
    if (!el) return;
    const prs = GT.pendingRecords(s).byEntry[i] || [];
    el.outerHTML = exCard(s, s.exercises[i], i, sessMode(), prs);
    repaintHead(s);
  }
  function repaintHead(s) {
    const st = GT.sessionStats(s);
    const bar = $("#sessBar"); if (bar) { bar.style.width = st.pct + "%"; bar.parentNode.classList.toggle("done", st.pct >= 100); bar.parentNode.setAttribute("aria-valuenow", st.pct); }
    const p = $("#sessPct"); if (p) p.textContent = `${st.reqDone}/${st.reqSets} sets`;
  }
  function changed(s) {
    s.updatedAt = new Date().toISOString();
    if (s.status === "completed") { GT.recomputeRecords(); }
    GT.saveSoon();
  }
  function checkPRs(s, i) {
    const found = GT.pendingRecords(s).byEntry[i] || [];
    const seen = announcedFor(s);
    const fresh = found.filter((f) => !seen.has(prKey(i, f)));
    fresh.forEach((f) => seen.add(prKey(i, f)));
    if (fresh.length && s.status === "active") {
      const f = fresh[0];
      toast(`<div class="row" style="gap:8px"><span class="pb-badge pb-pop">🏆 New PB</span><strong>${esc(f.name)}</strong></div>
        <div class="small" style="margin-top:4px">${fresh.map((x) => `${PR_LABEL[x.type]}: ${esc(prValue(x, x.prev))} → <b>${esc(prValue(x))}</b>`).join("<br>")}</div>
        <div class="tiny muted" style="margin-top:2px">${fmtDay(today(), { weekday: "long", day: "numeric", month: "short" })}</div>`, "pb", 5200);
    }
  }

  // ---------- Records
  let recEx = null;
  VIEWS.records = function () {
    const best = S().records.best || {};
    const hist = S().records.history;
    const ids = Object.keys(best).sort((a, b) => best[a].name.localeCompare(best[b].name));
    if (!ids.length) return `<div class="page-head"><h1>Personal records</h1></div><div class="empty"><strong>No records yet</strong>Complete a workout and your heaviest sets, estimated 1RMs and best volumes appear here. Each exercise variant (machine or free-weight) is tracked separately.</div>`;
    if (!recEx || !best[recEx]) recEx = ids[0];
    const recent = hist.filter((h) => !h.first).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    return `<div class="page-head"><div><h1>Personal records</h1><p class="muted small">Tracked separately for each exercise variant. Estimated 1RM uses the Epley formula, weight × (1 + reps ÷ 30), for loaded sets of 1–${GT.E1RM_MAX_REPS} reps. For dumbbell exercises the weight is one dumbbell.</p></div></div>
      <section class="card"><h2>Recent personal bests</h2>${recent.length ? `<div class="list">${recent.map(prRow).join("")}</div>` : `<p class="muted small">Baselines are set. Beat one in a later session to earn a PB.</p>`}</section>
      <section class="card stack"><div class="row between"><h2>Strength progression</h2>
        <select class="input" style="width:auto;max-width:100%" data-action="rec-ex" aria-label="Exercise for progression chart">${ids.map((id) => `<option value="${esc(id)}" ${id === recEx ? "selected" : ""}>${esc(best[id].name)}</option>`).join("")}</select></div>
        ${progressionChart(recEx)}</section>
      <div class="section-title"><h2>All exercises</h2></div>
      <div class="grid">${ids.map((id) => recordCard(id, best[id], hist.filter((h) => h.exId === id))).join("")}</div>`;
  };
  function progressionChart(exId) {
    const pts = [];
    GT.completedSorted().forEach((s) => s.exercises.forEach((e) => {
      if (e.skipped || GT.curEx(e).id !== exId) return;
      const agg = GT.aggregate(e);
      if (!agg) return;
      let y = null, tip = "";
      if (agg.e1rm) { y = GT.toDisplay(agg.e1rm.value); tip = `<b>e1RM ${fmtW(agg.e1rm.value)}</b><br>${fmtW(agg.e1rm.w)} × ${agg.e1rm.reps}`; }
      else if (agg.maxTime) { y = agg.maxTime.value; tip = `<b>${agg.maxTime.value} s</b> hold`; }
      else { const r = Math.max(...Object.values(agg.repsAt)); y = r; tip = `<b>${r} reps</b>`; }
      pts.push({ y, label: fmtDay(s.localDate, { day: "numeric", month: "numeric" }), tip: `${tip}<br>${fmtDay(s.localDate)}` });
    }));
    const kind = (S().records.best[exId] || {}).e1rm ? "Best estimated 1RM per session" : (S().records.best[exId] || {}).maxTime ? "Longest hold per session" : "Most reps per session";
    return `<p class="muted small">${kind}</p>` + lineChart(pts, { fmtY: (v) => Math.round(v) });
  }
  function recordCard(id, b, hist) {
    const cell = (label, value, sub) => `<div class="rec-cell"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
    const d = (x) => { if (!x) return ""; const ld = GT.localDate(x.date); return fmtDay(ld, ld.slice(0, 4) === today().slice(0, 4) ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }); };
    const reps = Object.keys(b.repsAt).map((k) => ({ w: +k, ...b.repsAt[k] })).sort((x, y) => y.w - x.w).slice(0, 6);
    const ex = GT.exercise(id);
    return `<article class="card stack"><div class="row between"><h3>${esc(b.name)}</h3>${ex ? `<span class="chip">${EQUIP[ex.equipment]}</span>` : ""}</div>
      <div class="rec-grid">
        ${b.maxW ? cell("Heaviest set", fmtW(b.maxW.value), `× ${b.maxW.reps} · ${d(b.maxW)}`) : ""}
        ${b.e1rm ? cell("Best est. 1RM", fmtW(b.e1rm.value), `${fmtW(b.e1rm.w)} × ${b.e1rm.reps} · ${d(b.e1rm)}`) : ""}
        ${b.volume ? cell("Best session volume", fmtVol(b.volume.value), d(b.volume)) : ""}
        ${b.maxTime ? cell("Longest hold", b.maxTime.value + " s", d(b.maxTime)) : ""}
      </div>
      ${reps.length ? `<details class="tech"><summary>Most reps at each weight</summary><table class="data"><thead><tr><th>Weight</th><th>Best reps</th><th>Date</th></tr></thead><tbody>${reps.map((r) => `<tr><td>${r.w > 0 ? fmtW(r.w) : "Bodyweight"}</td><td>${r.reps}</td><td>${d(r)}</td></tr>`).join("")}</tbody></table></details>` : ""}
      ${hist.length ? `<details class="tech"><summary>Record history (${hist.length})</summary><ul class="timeline">${hist.slice().reverse().map((h) => `<li><span>${h.first ? "" : `<span class="pb-badge">PB</span> `}${PR_LABEL[h.type]}: ${h.prev !== null ? esc(prValue(h, h.prev)) + " → " : ""}<b>${esc(prValue(h))}</b>${h.first ? ' <span class="muted">(first recorded)</span>' : ""}</span><span class="muted">${d(h)}</span></li>`).join("")}</ul></details>` : ""}
    </article>`;
  }

  // ---------- History
  VIEWS.history = function (id) {
    if (id) return historyDetail(id);
    const list = GT.completedSorted().reverse();
    const t = today(), ms = t.slice(0, 8) + "01";
    const month = GT.totals(ms, GT.localDate(new Date(+t.slice(0, 4), +t.slice(5, 7), 0)), false);
    return `<div class="page-head"><div><h1>History</h1><p class="muted small">Completed workouts. Calories are estimates.</p></div></div>
      <section class="stats">
        <div class="stat"><div class="label">Workouts this month</div><div class="value">${month.workouts}</div></div>
        <div class="stat"><div class="label">Est. calories this month</div><div class="value">${kcalNum(month.kcal)}<small>kcal</small></div></div>
        <div class="stat"><div class="label">Time this month</div><div class="value">${fmtMin(month.minutes)}</div></div>
        <div class="stat"><div class="label">All workouts</div><div class="value">${list.length}</div></div>
      </section>
      ${list.length ? `<div class="grid">${list.map((s) => {
        const st = GT.sessionStats(s), prs = GT.sessionPRs(s.id).length;
        return `<a class="card stack" style="text-decoration:none;color:inherit" href="#/history/${s.id}">
          <div class="row between nowrap"><div><strong>${fmtDay(s.localDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</strong><div class="small muted">Day ${s.dayNumber}: ${esc(s.dayName)}</div></div>${prs ? `<span class="pb-badge">${prs} PB${prs > 1 ? "s" : ""}</span>` : ""}</div>
          <dl class="kv"><div><dt>Duration</dt><dd>${fmtMin(s.durationMin)}</dd></div><div><dt>Est. kcal</dt><dd>${s.calories ? "≈ " + kcalNum(s.calories.gross) : "—"}</dd></div>
          <div><dt>Exercises</dt><dd>${st.exDone}/${st.exTotal}</dd></div><div><dt>Sets</dt><dd>${st.sets}</dd></div><div><dt>Volume</dt><dd>${fmtVol(st.volume)}</dd></div></dl></a>`;
      }).join("")}</div>` : `<div class="empty"><strong>No completed workouts</strong>Finished workouts are listed here with their sets, time and calorie estimates.</div>`}`;
  };
  function historyDetail(id) {
    const s = GT.session(id);
    if (!s || s.status !== "completed") return notFound("That workout couldn't be found.");
    const st = GT.sessionStats(s), prs = GT.sessionPRs(s.id);
    return `<div class="page-head"><div><a href="#/history" class="small">${icon("back")} History</a><h1 style="margin-top:6px">Day ${s.dayNumber}: ${esc(s.dayName)}</h1>
      <p class="muted small">${fmtDateTime(s.startedAt)} – ${fmtTime(s.endedAt)}${s.localDate !== GT.localDate(s.endedAt) ? " (next day)" : ""}</p></div>
      <div class="row"><a class="btn" href="#/edit/${s.id}">${icon("edit")} Edit sets</a><button class="btn danger" data-action="hist-delete" data-id="${s.id}">Delete</button></div></div>
      <section class="card stack"><div class="row between"><h2>Summary</h2><button class="btn sm" data-action="hist-meta" data-id="${s.id}">Edit duration & calories</button></div>
        <dl class="kv">
          <div><dt>Duration</dt><dd>${fmtMin(s.durationMin)}${s.durationEdited ? ' <span class="chip info">edited</span>' : ""}</dd></div>
          <div><dt>Intensity</dt><dd>${INTENSITY[s.intensity]}</dd></div>
          <div><dt>Body weight used</dt><dd>${s.bodyWeightKg ? fmtW(s.bodyWeightKg) : "—"}</dd></div>
          <div><dt>Est. gross kcal</dt><dd>${s.calories ? fmtKcal(s.calories.gross) : "—"}</dd></div>
          <div><dt>Est. active kcal</dt><dd>${s.calories ? fmtKcal(s.calories.active) : "—"}</dd></div>
          <div><dt>Exercises</dt><dd>${st.exDone} done · ${st.exSkipped} skipped</dd></div>
          <div><dt>Sets completed</dt><dd>${st.sets}</dd></div>
          <div><dt>Total volume</dt><dd>${fmtVol(st.volume)}</dd></div>
        </dl>
        <p class="note">Calories are estimates from MET × body weight × duration, not measurements.</p>
      </section>
      ${prs.length ? `<section class="card"><h2>Personal bests achieved</h2><div class="list">${prs.map(prRow).join("")}</div></section>` : ""}
      ${s.exercises.map((e) => {
        const ex = GT.curEx(e), status = GT.exStatus(e);
        return `<section class="card stack"><div class="row between"><div><h3>${esc(ex.name)}</h3><div class="small muted">${variantLabel(e.variant)} · ${EQUIP[ex.equipment] || ""}${ex.load === "per-dumbbell" ? " · weight per dumbbell" : ""}</div></div>
          <span class="chip ${status === "done" ? "done" : status === "skipped" ? "skip" : status === "progress" ? "progress" : ""}">${status === "done" ? "Completed" : status === "skipped" ? "Skipped" : status === "progress" ? "Partial" : "Not done"}</span></div>
          <table class="hist-sets"><thead><tr><th>Set</th><th>Weight</th><th>${ex.kind === "time" ? "Seconds" : "Reps"}</th><th>RPE</th><th>Status</th></tr></thead><tbody>
          ${GT.curSets(e).map((x, j) => `<tr class="${x.skipped || e.skipped ? "skipped" : ""}"><td>${j + 1}${x.extra ? "+" : ""}</td><td>${x.w !== null ? fmtW(x.w) : "—"}</td><td>${x.r !== null ? x.r : "—"}</td><td>${x.rpe || "—"}</td><td>${e.skipped ? "skipped" : x.skipped ? "skipped" : x.done ? "✓ done" : "not done"}</td></tr>`).join("")}
          </tbody></table>${ex.kind !== "time" ? `<div class="small muted">Volume ${fmtVol(GT.exVolume(e))}</div>` : ""}</section>`;
      }).join("")}`;
  }

  // ---------- Library
  const lib = { q: "", eq: "all" };
  VIEWS.library = function () {
    return `<div class="page-head"><div><h1>Exercise library</h1><p class="muted small">Every programme exercise and its alternative. Edit details, images and prescriptions, or add your own.</p></div>
      <button class="btn primary" data-action="custom-new">${icon("plus")} Custom exercise</button></div>
      <input class="search" type="search" placeholder="Search by name or muscle…" aria-label="Search exercises" data-action="lib-search" value="${esc(lib.q)}">
      <div class="filter-chips" role="group" aria-label="Filter by equipment">${["all", "machine", "cable", "dumbbell", "bodyweight"].map((k) => `<button type="button" data-action="lib-filter" data-eq="${k}" aria-pressed="${lib.eq === k}">${k === "all" ? "All" : EQUIP[k]}</button>`).join("")}</div>
      <div id="libList">${libraryList()}</div>`;
  };
  function libraryList() {
    const q = lib.q.trim().toLowerCase();
    const items = GT.allExercises().filter((e) => (lib.eq === "all" || e.equipment === lib.eq) &&
      (!q || e.name.toLowerCase().includes(q) || (e.muscles || []).some((m) => m.toLowerCase().includes(q))))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) return `<div class="empty"><strong>No exercises match</strong>Try another search or filter.</div>`;
    return `<p class="small muted">${plural(items.length, "exercise")}</p><div class="grid">${items.map(libItem).join("")}</div>`;
  }
  function libItem(ex) {
    const uses = GT.slotUsage(ex.id);
    const pairs = uses.map((u) => {
      const other = GT.exercise(u.role === "primary" ? u.slot.alt : u.slot.primary);
      return `<div class="small">Day ${u.dayIndex + 1} · ${u.role === "primary" ? "main" : "alternative"}${other ? ` — ${u.role === "primary" ? "alternative" : "main"}: <b>${esc(other.name)}</b>` : ""}
        <button class="linkbtn small" data-action="slot-edit" data-day="${u.day.id}" data-slot="${u.slot.id}">Edit sets/reps/rest</button></div>`;
    }).join("");
    return `<article class="card lib-item">
      ${thumb(ex)}
      <div class="stack" style="gap:6px;min-width:0">
        <div class="row between nowrap"><h3>${esc(ex.name)}</h3><span class="chip">${EQUIP[ex.equipment] || ex.equipment}</span></div>
        <div class="small muted">${esc((ex.muscles || []).join(" · "))}${ex.kind === "time" ? " · timed" : ""}</div>
        <div class="chips">${ex.custom ? `<span class="chip info">Custom</span>` : ""}${GT.isModified(ex.id) ? `<span class="chip info">Edited</span>` : ""}${ex.image && !ex.image.exact && !ex.imageUrl ? `<span class="chip">Similar photo</span>` : ""}</div>
        ${pairs || `<div class="small muted">Not used in any workout day.</div>`}
        <details class="tech"><summary>Technique</summary>${ex.technique && ex.technique.length ? `<ol>${ex.technique.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>` : `<p class="small muted">No technique notes yet.</p>`}</details>
        <div class="row"><button class="btn sm" data-action="ex-edit" data-ex="${esc(ex.id)}">${icon("edit")} Edit details</button>
          ${GT.isModified(ex.id) && !ex.custom ? `<button class="btn sm ghost" data-action="ex-reset" data-ex="${esc(ex.id)}">Reset to default</button>` : ""}
          ${ex.custom && !uses.length ? `<button class="btn sm danger" data-action="ex-delete" data-ex="${esc(ex.id)}">Delete</button>` : ""}</div>
      </div></article>`;
  }

  // ---------- Profile & settings
  VIEWS.profile = function () {
    const p = S().profile, st = S().settings, u = U();
    let size = 0; try { size = (localStorage.getItem(GT.KEY) || "").length; } catch (e) { /* ignore */ }
    const sel = (name, opts, cur) => `<select id="${name}" name="${name}" data-pf="${name}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    return `<div class="page-head"><div><h1>Profile & settings</h1><p class="muted small">Everything is stored only in this browser.</p></div></div>
      <section class="card stack"><h2>Profile</h2>
        <div class="form-grid">
          <div class="field"><label for="bodyWeight">Body weight (${u})</label><input id="bodyWeight" type="number" inputmode="decimal" step="any" min="${u === "kg" ? 25 : 55}" max="${u === "kg" ? 350 : 770}" data-pf="bodyWeight" value="${esc(p.bodyWeightKg ? round(GT.toDisplay(p.bodyWeightKg), 1) : "")}"><span class="hint">Used for calorie estimates</span></div>
          <div class="field"><label for="heightCm">Height (cm)</label><input id="heightCm" type="number" inputmode="decimal" min="100" max="250" data-pf="heightCm" value="${esc(p.heightCm || "")}"></div>
          <div class="field"><label for="age">Age</label><input id="age" type="number" inputmode="numeric" min="13" max="100" data-pf="age" value="${esc(p.age || "")}"></div>
          <div class="field"><label for="sex">Sex (optional)</label>${sel("sex", [["", "Prefer not to say"], ["female", "Female"], ["male", "Male"], ["other", "Other"]], p.sex)}</div>
          <div class="field"><label for="goal">Fitness goal</label>${sel("goal", [["general", "General fitness"], ["muscle", "Build muscle"], ["strength", "Get stronger"], ["fatloss", "Lose fat"], ["maintain", "Maintain"]], p.goal)}</div>
          <div class="field"><label for="units">Preferred units</label>${sel("units", [["kg", "Kilograms (kg)"], ["lb", "Pounds (lb)"]], p.units)}<span class="hint">Data is stored in kg and converted for display</span></div>
          <div class="field full"><label for="defaultDurationMin">Default workout duration (minutes)</label><input id="defaultDurationMin" type="number" inputmode="numeric" min="10" max="300" data-pf="defaultDurationMin" value="${esc(p.defaultDurationMin)}"><span class="hint">Used for the planned calorie estimate and to flag a timer that was left running. It never replaces your recorded time.</span></div>
        </div>
        <p class="err-text" id="pfErr" role="alert" hidden></p>
      </section>
      <section class="card stack"><h2>Preferences</h2>
        <div class="form-grid">
          <div class="field"><label for="theme">Theme</label>${sel("theme", [["dark", "Dark"], ["light", "Light"]], st.theme)}</div>
          <div class="field"><label for="defaultIntensity">Default intensity</label>${sel("defaultIntensity", Object.keys(INTENSITY).map((k) => [k, INTENSITY[k]]), st.defaultIntensity)}</div>
        </div>
        <label class="switch"><span>Start rest timer when a set is ticked</span><input type="checkbox" data-pf="autoRest" ${st.autoRest ? "checked" : ""}></label>
        <label class="switch"><span>Beep when rest is over</span><input type="checkbox" data-pf="restSound" ${st.restSound ? "checked" : ""}></label>
        <label class="switch"><span>Include the in-progress workout in dashboard totals</span><input type="checkbox" data-pf="includeActiveInTotals" ${st.includeActiveInTotals ? "checked" : ""}></label>
      </section>
      <section class="card stack"><h2>How calories are estimated</h2>
        <p class="small">All totals use <b>gross calories</b>: MET × 3.5 × body weight (kg) ÷ 200 × duration (minutes). Duration is your recorded workout time from start to finish, including rest and excluding paused time. Active calories (shown per workout) subtract resting energy: (MET − 1) × 3.5 × kg ÷ 200 × minutes.</p>
        <p class="small">MET values: light 3.0, moderate 3.5 (default), vigorous 6.0. These are population averages for resistance training — real expenditure varies with fitness, effort, body composition and rest length. Treat every number as an estimate, not a measurement. Sets, reps and weights are not used for calories.</p>
      </section>
      <section class="card stack"><h2>Backup & data</h2>
        <p class="small muted">Saved data: ${(size / 1024).toFixed(1)} KB · ${plural(S().sessions.filter((s) => s.status === "completed").length, "completed workout")}${S().savedAt ? ` · last saved ${fmtDateTime(S().savedAt)}` : ""}</p>
        <div class="row">
          <button class="btn" data-action="export-json">Export backup (JSON)</button>
          <label class="btn" for="importFile">Import backup…</label><input id="importFile" type="file" accept="application/json,.json" hidden data-action="import-file">
        </div>
        <div class="row">
          <button class="btn sm" data-action="export-csv" data-kind="history">History CSV</button>
          <button class="btn sm" data-action="export-csv" data-kind="sets">Set-level CSV</button>
        </div>
        <div class="divider"></div>
        <button class="btn danger" data-action="clear-all">Clear all data…</button>
      </section>
      <section class="card stack"><h2>About</h2>
        <p class="small">Exercise photos: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">Free Exercise DB</a> (public domain), bundled with the app. Photos marked "Similar" show a closely related movement.</p>
        <p class="small">Also in this project: <a href="../">Weight Log</a> for tracking body weight.</p>
      </section>`;
  };

  function notFound(msg) { return `<div class="empty"><strong>Not found</strong>${esc(msg)} <a href="#/">Go to dashboard</a></div>`; }

  // =====================================================================
  // ACTIONS
  // =====================================================================
  const A = {};

  A.start = async (el) => {
    const dayId = el.dataset.day;
    const act = GT.activeSession();
    if (act) {
      if (act.dayId === dayId) return go("#/session");
      const r = await openModal({
        title: "Workout already in progress",
        body: `<p>You have an unfinished <b>Day ${act.dayNumber}: ${esc(act.dayName)}</b> workout (${fmtClock(GT.elapsedMs(act))} elapsed).</p><p class="small muted">Discarding deletes its sets. To keep it, resume and finish it first.</p>`,
        actions: [{ label: "Cancel", value: "cancel", cls: "ghost" }, { label: "Discard it & start new", value: "discard", cls: "danger" }, { label: "Resume it", value: "resume", cls: "primary" }],
      });
      if (r.value === "resume") return go("#/session");
      if (r.value !== "discard") return;
      GT.discardSession(act.id);
    }
    unlockAudio();
    const s = GT.startSession(dayId);
    delete ui.open[s.id];
    go("#/session");
  };

  A["sess-pause"] = () => { const s = GT.activeSession(); if (!s) return; GT.togglePause(s); render(); };
  A["sess-intensity"] = (el) => { const s = GT.activeSession(); if (!s) return; s.intensity = el.value; GT.saveSoon(); tick(); };
  A["sess-discard"] = async () => {
    const s = GT.activeSession(); if (!s) return;
    if (!(await confirmDialog("Discard this workout?", "All sets you entered in this workout will be deleted. This can't be undone.", "Discard workout", true))) return;
    GT.discardSession(s.id); toast("Workout discarded."); go("#/");
  };
  A["sess-finish"] = async () => {
    const s = GT.activeSession(); if (!s) return;
    GT.flush();
    const st = GT.sessionStats(s);
    const measured = Math.round(GT.elapsedMs(s) / 6000) / 10;
    const dflt = S().profile.defaultDurationMin || 60;
    const tooShort = measured < 1, tooLong = measured > Math.max(dflt * 3, 180);
    const unfinished = s.exercises.filter((e) => ["pending", "progress"].includes(GT.exStatus(e))).length;
    const bw = S().profile.bodyWeightKg;
    const r = await openModal({
      title: "Finish workout",
      body: `<dl class="kv"><div><dt>Exercises done</dt><dd>${st.exDone}/${st.exTotal}</dd></div><div><dt>Sets</dt><dd>${st.sets}</dd></div><div><dt>Volume</dt><dd>${fmtVol(st.volume)}</dd></div><div><dt>Timer</dt><dd>${fmtClock(GT.elapsedMs(s))}</dd></div></dl>
        ${unfinished ? `<p class="banner warn" style="margin:0">${plural(unfinished, "exercise")} not finished. They'll be saved as incomplete and won't count as completed exercises.</p>` : ""}
        ${st.sets === 0 ? `<p class="banner warn" style="margin:0">No sets are ticked as done. The workout will be saved but nothing counts toward records.</p>` : ""}
        <div class="form-grid">
          <div class="field"><label for="fDur">Duration (minutes)</label><input id="fDur" name="dur" type="number" inputmode="decimal" step="any" min="1" max="600" required value="${tooShort ? "" : measured}">
            <span class="hint">${tooShort ? "The timer recorded less than a minute — enter how long you trained." : tooLong ? `⚠ The timer ran ${fmtMin(measured)}. If you forgot to stop it, correct it here.` : "From the timer (paused time excluded). Edit if needed."}</span></div>
          <div class="field"><label for="fInt">Intensity</label><select id="fInt" name="intensity">${Object.keys(INTENSITY).map((k) => `<option value="${k}" ${s.intensity === k ? "selected" : ""}>${INTENSITY[k]}</option>`).join("")}</select></div>
          <div class="field full"><label for="fBw">Body weight (${U()})</label><input id="fBw" name="bw" type="number" inputmode="decimal" step="any" min="1" value="${bw ? round(GT.toDisplay(bw), 1) : ""}" required><span class="hint">Needed for the calorie estimate</span></div>
        </div>
        <div class="subtle" id="fKcal" aria-live="polite"></div>`,
      actions: [{ label: "Keep training", value: "cancel", cls: "ghost" }, { label: "Save workout", value: "ok", cls: "primary" }],
      validate: (f) => {
        const d = GT.num(f.elements.dur.value), w = GT.fromDisplay(f.elements.bw.value);
        if (!(d >= 1 && d <= 600)) return "Enter a workout duration between 1 and 600 minutes.";
        if (!(w >= 25 && w <= 350)) return "Enter your body weight so calories can be estimated.";
        return null;
      },
      onOpen: (f) => {
        const upd = () => {
          const c = GT.calories(GT.MET[f.elements.intensity.value], GT.fromDisplay(f.elements.bw.value), GT.num(f.elements.dur.value));
          $("#fKcal").innerHTML = c ? `Estimated <b>${Math.round(c.gross)} kcal</b> gross · ${Math.round(c.active)} kcal active <span class="tiny muted">(MET ${c.met} × 3.5 × ${round(GT.fromDisplay(f.elements.bw.value), 1)} kg ÷ 200 × ${GT.num(f.elements.dur.value)} min)</span>` : `<span class="muted">Enter duration and body weight to see the estimate.</span>`;
        };
        f.oninput = upd; upd();
        if (tooShort) f.elements.dur.focus();
      },
    });
    if (r.value !== "ok") return;
    const bodyWeightKg = GT.fromDisplay(r.data.bw);
    if (!S().profile.bodyWeightKg) S().profile.bodyWeightKg = bodyWeightKg;
    const before = new Set(S().records.history.map((h) => h.id));
    GT.finishSession(s, { durationMin: GT.num(r.data.dur), intensity: r.data.intensity, bodyWeightKg });
    const prs = GT.sessionPRs(s.id).filter((h) => !before.has(h.id));
    toast(`<strong>Workout saved.</strong> ${s.calories ? fmtKcal(s.calories.gross) + " (estimate)" : ""}${prs.length ? `<br><span class="pb-badge pb-pop">🏆 ${plural(prs.length, "personal best")}</span>` : ""}`, prs.length ? "pb" : "", 4500);
    go("#/history/" + s.id);
  };

  A["ex-toggle"] = (el) => {
    const s = currentSession(); if (!s) return;
    const i = +el.dataset.i, set = openSet(s);
    if (set.has(i)) set.delete(i); else set.add(i);
    repaintCard(s, i);
  };
  A["ex-next"] = (el) => {
    const s = currentSession(); if (!s) return;
    const i = +el.dataset.i, n = +el.dataset.next, set = openSet(s);
    set.delete(i); set.add(n);
    repaintCard(s, i); repaintCard(s, n);
    const t = document.getElementById("ex-" + n);
    if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  A.variant = (el) => {
    const s = currentSession(); if (!s) return;
    const i = +el.dataset.i, e = s.exercises[i];
    if (e.variant === el.dataset.v) return;
    e.variant = el.dataset.v;
    if (!e.sets[e.variant] || !e.sets[e.variant].length) {
      const ex = GT.exercise(e[e.variant].id) || e[e.variant];
      e.sets[e.variant] = GT.buildSets(ex, GT.curTarget(e));
    }
    changed(s); repaintCard(s, i);
    toast(`Now tracking <b>${esc(GT.curEx(e).name)}</b>. Sets you entered for the other variant are kept if you switch back.`, "", 2600);
  };
  A["ex-skip"] = (el) => {
    const s = currentSession(); if (!s) return;
    const i = +el.dataset.i, e = s.exercises[i];
    e.skipped = !e.skipped;
    changed(s); repaintCard(s, i);
  };
  A["ex-complete"] = async (el) => {
    const s = currentSession(); if (!s) return;
    const i = +el.dataset.i, e = s.exercises[i], sets = GT.curSets(e);
    if (GT.exStatus(e) === "done") {
      el.checked = true;
      if (!(await confirmDialog("Mark exercise as not done?", "All sets for this exercise will be unticked. Weights and reps stay.", "Untick sets"))) return;
      sets.forEach((x) => { x.done = false; x.doneAt = null; });
    } else {
      el.checked = false;
      const todo = sets.filter((x) => !x.extra && !x.skipped && !x.done);
      const bad = todo.filter((x) => !(x.r > 0));
      if (bad.length) { toast(`Enter ${GT.curEx(e).kind === "time" ? "seconds" : "reps"} for every set first (${plural(bad.length, "set")} missing).`, "err"); return; }
      if (!todo.length && !sets.some((x) => x.done)) { toast("No sets to complete.", "err"); return; }
      const now = new Date().toISOString();
      todo.forEach((x) => { x.done = true; x.doneAt = now; });
    }
    changed(s); repaintCard(s, i); checkPRs(s, i);
  };
  A["set-add"] = (el) => {
    const s = currentSession(); if (!s) return;
    const i = +el.dataset.i, e = s.exercises[i], sets = GT.curSets(e), last = sets[sets.length - 1];
    sets.push({ w: last ? last.w : null, r: last ? last.r : GT.midReps(GT.curTarget(e).repsMin, GT.curTarget(e).repsMax), rpe: null, done: false, skipped: false, extra: true, doneAt: null });
    changed(s); repaintCard(s, i);
  };
  A["set-menu"] = async (el) => {
    const s = currentSession(); if (!s) return;
    const row = el.closest(".set-row"), i = +row.dataset.i, j = +row.dataset.j, e = s.exercises[i], x = GT.curSets(e)[j];
    const acts = [{ label: "Cancel", value: "cancel", cls: "ghost" }, { label: "Clear values", value: "clear" }, { label: x.skipped ? "Unskip set" : "Skip set", value: "skip" }];
    if (x.extra || GT.curSets(e).length > 1) acts.push({ label: "Delete set", value: "delete", cls: "danger" });
    const r = await openModal({ title: `Set ${j + 1} — ${GT.curEx(e).name}`, body: `<p class="small muted">${x.extra ? "This is an extra set." : "This is a prescribed set."} Skipped sets don't count as completed and are ignored when deciding if the exercise is done.</p>`, actions: acts });
    if (!r.value) return;
    if (r.value === "clear") Object.assign(x, { w: null, r: null, rpe: null, done: false, doneAt: null });
    if (r.value === "skip") { x.skipped = !x.skipped; if (x.skipped) { x.done = false; x.doneAt = null; } }
    if (r.value === "delete") GT.curSets(e).splice(j, 1);
    changed(s); repaintCard(s, i);
  };
  A["rest-start"] = (el) => {
    const s = currentSession(); if (!s) return;
    unlockAudio();
    const e = s.exercises[+el.dataset.i];
    rest.start(GT.curTarget(e).rest, GT.curEx(e).name);
  };
  A["rest-pause"] = () => rest.pause();
  A["rest-reset"] = () => rest.reset();
  A["rest-add"] = () => rest.add(15);
  A["rest-close"] = () => rest.close();

  A["hist-delete"] = async (el) => {
    if (!(await confirmDialog("Delete this workout?", "It will be removed from history, weekly totals and records. Records it set will be recalculated from your remaining workouts.", "Delete workout", true))) return;
    GT.discardSession(el.dataset.id); toast("Workout deleted."); go("#/history");
  };
  A["hist-meta"] = async (el) => {
    const s = GT.session(el.dataset.id); if (!s) return;
    const r = await openModal({
      title: "Duration & calories",
      body: `<div class="form-grid">
        <div class="field"><label for="mDur">Duration (minutes)</label><input id="mDur" name="dur" type="number" inputmode="decimal" step="any" min="1" max="600" value="${esc(s.durationMin || "")}"></div>
        <div class="field"><label for="mInt">Intensity</label><select id="mInt" name="intensity">${Object.keys(INTENSITY).map((k) => `<option value="${k}" ${s.intensity === k ? "selected" : ""}>${INTENSITY[k]}</option>`).join("")}</select></div>
        <div class="field full"><label for="mBw">Body weight at the time (${U()})</label><input id="mBw" name="bw" type="number" inputmode="decimal" step="any" value="${s.bodyWeightKg ? round(GT.toDisplay(s.bodyWeightKg), 1) : ""}"></div></div>
        <div class="subtle" id="mKcal"></div><p class="note">Saving replaces this workout's estimate. It is still counted once in weekly and monthly totals.</p>`,
      actions: [{ label: "Cancel", value: "cancel", cls: "ghost" }, { label: "Save", value: "ok", cls: "primary" }],
      validate: (f) => (!(GT.num(f.elements.dur.value) >= 1 && GT.num(f.elements.dur.value) <= 600) ? "Enter a duration between 1 and 600 minutes." : !(GT.fromDisplay(f.elements.bw.value) >= 25) ? "Enter a valid body weight." : null),
      onOpen: (f) => {
        const upd = () => { const c = GT.calories(GT.MET[f.elements.intensity.value], GT.fromDisplay(f.elements.bw.value), GT.num(f.elements.dur.value)); $("#mKcal").innerHTML = c ? `New estimate: <b>${Math.round(c.gross)} kcal</b> gross · ${Math.round(c.active)} kcal active` : "—"; };
        f.oninput = upd; upd();
      },
    });
    if (r.value !== "ok") return;
    GT.updateCompletedMeta(s, { durationMin: GT.num(r.data.dur), intensity: r.data.intensity, bodyWeightKg: GT.fromDisplay(r.data.bw) });
    toast("Workout updated."); render();
  };

  A["rec-ex"] = (el) => { recEx = el.value; render(); };

  // Template editing
  function exerciseOptions(selected, allowNone) {
    const groups = {};
    GT.allExercises().forEach((e) => { (groups[e.equipment] = groups[e.equipment] || []).push(e); });
    return (allowNone ? `<option value="">None</option>` : "") + Object.keys(EQUIP).filter((k) => groups[k]).map((k) =>
      `<optgroup label="${EQUIP[k]}">${groups[k].sort((a, b) => a.name.localeCompare(b.name)).map((e) => `<option value="${esc(e.id)}" ${e.id === selected ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</optgroup>`).join("");
  }
  async function editSlot(dayId, slotId, preset = {}) {
    const d = GT.template(dayId); if (!d) return;
    const isNew = !slotId;
    const s = isNew ? { id: GT.uid("slot"), primary: "", alt: "", sets: 3, repsMin: 8, repsMax: 12, rest: 90, perSide: false } : d.slots.find((x) => x.id === slotId);
    if (!s) return;
    const v = Object.assign({}, s, preset);
    const def = GT.defaultSlot(s.id);
    const actions = [{ label: "Cancel", value: "cancel", cls: "ghost" }];
    if (!isNew) actions.push({ label: "Remove from day", value: "remove", cls: "danger", novalidate: true });
    if (def && GT.slotModified(s)) actions.push({ label: "Reset to defaults", value: "reset", novalidate: true });
    actions.push({ label: isNew ? "Add exercise" : "Save", value: "ok", cls: "primary" });
    const r = await openModal({
      title: isNew ? `Add exercise to Day ${S().templates.indexOf(d) + 1}` : "Edit exercise prescription",
      body: `<div class="form-grid">
        <div class="field full"><label for="sP">Main exercise</label><select id="sP" name="primary" required><option value="">Choose…</option>${exerciseOptions(v.primary)}</select></div>
        <div class="field full"><label for="sA">Alternative (free-weight / bodyweight)</label><select id="sA" name="alt">${exerciseOptions(v.alt, true)}</select>
          <button type="button" class="linkbtn small" data-sub="new-alt" style="justify-self:start">+ Create a custom alternative</button></div>
        <div class="field"><label for="sS">Sets</label><input id="sS" name="sets" type="number" inputmode="numeric" min="1" max="10" value="${v.sets}"></div>
        <div class="field"><label for="sR">Rest (seconds)</label><input id="sR" name="rest" type="number" inputmode="numeric" min="0" max="600" step="5" value="${v.rest}"></div>
        <div class="field"><label for="sMin">Reps / seconds min</label><input id="sMin" name="repsMin" type="number" inputmode="numeric" min="1" max="300" value="${v.repsMin}"></div>
        <div class="field"><label for="sMax">Reps / seconds max</label><input id="sMax" name="repsMax" type="number" inputmode="numeric" min="1" max="300" value="${v.repsMax}"></div>
        <label class="switch full"><span>Reps are per side</span><input type="checkbox" name="perSide" ${v.perSide ? "checked" : ""}></label>
        </div>${def ? `<p class="note">Programme default: ${GT.exercise(def.primary).name} / ${GT.exercise(def.alt).name}, ${def.sets} × ${def.repsMin}–${def.repsMax}, rest ${def.restLabel}.</p>` : ""}
        <p class="note">Changes apply to future workouts only. Past workouts keep what you did.</p>`,
      actions,
      validate: (f) => {
        if (!f.elements.primary.value) return "Choose a main exercise.";
        const n = (k) => GT.num(f.elements[k].value);
        if (!(n("sets") >= 1 && n("sets") <= 10)) return "Sets must be between 1 and 10.";
        if (!(n("repsMin") >= 1 && n("repsMax") >= n("repsMin"))) return "Max reps must be at least min reps (and min at least 1).";
        if (!(n("rest") >= 0 && n("rest") <= 600)) return "Rest must be 0–600 seconds.";
        if (f.elements.alt.value && f.elements.alt.value === f.elements.primary.value) return "The alternative should be a different exercise.";
        return null;
      },
      onOpen: (f) => { $("[data-sub=new-alt]", f).onclick = () => { f.dataset.sub = "new-alt"; modal.close("newalt"); }; },
    });
    if (r.value === "newalt") {
      const created = await editExercise(null);
      return editSlot(dayId, slotId, Object.assign(formSlot(r.data), created ? { alt: created } : {}));
    }
    if (r.value === "remove") {
      if (!(await confirmDialog("Remove exercise from this day?", "Past workouts that included it are not affected.", "Remove", true))) return;
      d.slots = d.slots.filter((x) => x.id !== s.id);
    } else if (r.value === "reset") {
      Object.assign(s, GT.clone(def));
    } else if (r.value === "ok") {
      const nv = formSlot(r.data);
      if (nv.alt !== s.alt) { delete s.altRepsMin; delete s.altRepsMax; delete s.altPerSide; }
      Object.assign(s, nv);
      if (isNew) d.slots.push(s);
    } else return;
    GT.save(); toast("Template updated."); render();
  }
  const formSlot = (d) => ({ primary: d.primary, alt: d.alt || "", sets: +d.sets, repsMin: +d.repsMin, repsMax: +d.repsMax, rest: +d.rest, perSide: !!d.perSide });
  A["slot-edit"] = (el) => editSlot(el.dataset.day, el.dataset.slot);
  A["slot-add"] = (el) => editSlot(el.dataset.day, null);
  A["slot-move"] = (el) => {
    const d = GT.template(el.dataset.day), i = +el.dataset.i, j = i + +el.dataset.dir;
    if (!d || j < 0 || j >= d.slots.length) return;
    [d.slots[i], d.slots[j]] = [d.slots[j], d.slots[i]];
    GT.save(); render();
  };
  A["day-reset"] = async (el) => {
    if (!(await confirmDialog("Reset this day?", "The exercises, order, sets, reps and rest return to the original programme. Past workouts are not affected.", "Reset day", true))) return;
    const i = S().templates.findIndex((t) => t.id === el.dataset.day);
    S().templates[i] = GT.clone(GT.PROGRAM.find((p) => p.id === el.dataset.day));
    GT.save(); toast("Day reset to programme defaults."); render();
  };

  // Exercise create/edit. Returns the new exercise id when one was created.
  async function editExercise(id) {
    const ex = id ? GT.exercise(id) : { name: "", equipment: "machine", kind: "reps", load: "stack", muscles: [], technique: [], imageUrl: "", custom: true };
    const custom = !id || ex.custom;
    const sel = (name, opts, cur) => `<select id="x_${name}" name="${name}">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    const r = await openModal({
      title: id ? "Edit exercise" : "New custom exercise", wide: true,
      body: `<div class="form-grid">
        <div class="field full"><label for="x_name">Name</label><input id="x_name" name="name" required maxlength="80" value="${esc(ex.name)}"></div>
        ${custom ? `<div class="field"><label for="x_equipment">Equipment</label>${sel("equipment", Object.keys(EQUIP).map((k) => [k, EQUIP[k]]), ex.equipment)}</div>
        <div class="field"><label for="x_kind">Tracked as</label>${sel("kind", [["reps", "Reps"], ["time", "Seconds (timed hold)"]], ex.kind)}</div>
        <div class="field full"><label for="x_load">Weight means</label>${sel("load", [["stack", "Machine stack / plates"], ["per-dumbbell", "One dumbbell (per hand)"], ["total", "Total load held"], ["bodyweight", "Added load (bodyweight exercise)"]], ex.load)}</div>` : ""}
        <div class="field full"><label for="x_muscles">Target muscles</label><input id="x_muscles" name="muscles" placeholder="e.g. Chest, Triceps" value="${esc((ex.muscles || []).join(", "))}"><span class="hint">Comma separated</span></div>
        <div class="field full"><label for="x_img">Image URL (optional)</label><input id="x_img" name="imageUrl" type="url" inputmode="url" placeholder="https://…" value="${esc(ex.imageUrl || "")}"><span class="hint">Use an image you have the right to use. Leave blank for the ${ex.image ? "bundled photo" : "built-in illustration"}. If it fails to load, a fallback is shown.</span></div>
        <div class="field full"><label for="x_tech">Technique steps</label><textarea id="x_tech" name="technique" placeholder="One step per line">${esc((ex.technique || []).join("\n"))}</textarea></div>
        ${!id ? `<div class="field full"><label for="x_add">Add to a workout day</label><select id="x_add" name="addTo"><option value="">Don't add now</option>${S().templates.map((t, i) => `<option value="${t.id}">Day ${i + 1}: ${esc(t.name)}</option>`).join("")}</select><span class="hint">Added with 3 × 8–12, rest 90 s. Edit it afterwards.</span></div>` : ""}
      </div>`,
      actions: [{ label: "Cancel", value: "cancel", cls: "ghost" }, { label: id ? "Save" : "Create exercise", value: "ok", cls: "primary" }],
      validate: (f) => {
        if (!f.elements.name.value.trim()) return "Give the exercise a name.";
        if (f.elements.imageUrl.value && !/^https?:\/\/|^img\//.test(f.elements.imageUrl.value.trim())) return "Image URL must start with http:// or https://";
        return null;
      },
    });
    if (r.value !== "ok") return null;
    const d = r.data;
    const fields = {
      name: d.name.trim(), muscles: d.muscles.split(",").map((m) => m.trim()).filter(Boolean),
      technique: d.technique.split("\n").map((t) => t.trim()).filter(Boolean), imageUrl: d.imageUrl.trim(),
    };
    if (custom) Object.assign(fields, { equipment: d.equipment, kind: d.kind, load: d.load });
    if (!id) {
      const nid = GT.uid("x");
      S().customExercises[nid] = Object.assign({ id: nid, custom: true, image: null }, fields);
      if (d.addTo) GT.template(d.addTo).slots.push({ id: GT.uid("slot"), primary: nid, alt: "", sets: 3, repsMin: 8, repsMax: 12, rest: 90, perSide: false });
      GT.save(); toast(`Created <b>${esc(fields.name)}</b>${d.addTo ? " and added it to the workout" : ""}.`);
      render();
      return nid;
    }
    if (ex.custom) Object.assign(S().customExercises[id], fields);
    else {
      const base = GT.BUILTIN[id], ov = {};
      if (fields.name !== base.name) ov.name = fields.name;
      if (fields.muscles.join("|") !== base.muscles.join("|")) ov.muscles = fields.muscles;
      if (fields.technique.join("|") !== base.technique.join("|")) ov.technique = fields.technique;
      if (fields.imageUrl) ov.imageUrl = fields.imageUrl;
      if (Object.keys(ov).length) S().exerciseOverrides[id] = ov; else delete S().exerciseOverrides[id];
    }
    GT.save(); toast("Exercise updated. Past workouts keep the name they were logged with."); render();
    return null;
  }
  A["custom-new"] = () => editExercise(null);
  A["ex-edit"] = (el) => editExercise(el.dataset.ex);
  A["ex-reset"] = async (el) => {
    if (!(await confirmDialog("Reset exercise?", "Name, muscles, technique and image return to the built-in defaults.", "Reset"))) return;
    delete S().exerciseOverrides[el.dataset.ex]; GT.save(); render();
  };
  A["ex-delete"] = async (el) => {
    if (!(await confirmDialog("Delete custom exercise?", "Past workouts that used it keep their data.", "Delete", true))) return;
    delete S().customExercises[el.dataset.ex]; GT.save(); render();
  };
  A.lightbox = (el) => { const ex = GT.exercise(el.dataset.ex); if (ex) lightbox(ex); };
  A["lib-filter"] = (el) => { lib.eq = el.dataset.eq; $$("[data-action=lib-filter]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.eq === lib.eq)); $("#libList").innerHTML = libraryList(); };

  // Data management
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  A["export-json"] = () => { download(`gym-tracker-backup-${today()}.json`, GT.exportJSON(), "application/json"); toast("Backup downloaded."); };
  A["export-csv"] = (el) => {
    const kind = el.dataset.kind;
    download(`gym-tracker-${kind}-${today()}.csv`, kind === "sets" ? GT.setsCSV() : GT.historyCSV(), "text/csv");
    toast("CSV downloaded.");
  };
  A["clear-all"] = async () => {
    const r = await openModal({
      title: "Clear all data?",
      body: `<p>This permanently deletes your profile, workouts, records, custom exercises and template changes from this browser.</p><p class="small muted">Export a backup first if you might want it back.</p>
        <div class="field"><label for="cConfirm">Type <b>DELETE</b> to confirm</label><input id="cConfirm" name="confirm" autocomplete="off" autocapitalize="characters"></div>`,
      actions: [{ label: "Cancel", value: "cancel", cls: "ghost" }, { label: "Clear everything", value: "ok", cls: "danger" }],
      validate: (f) => (f.elements.confirm.value.trim().toUpperCase() === "DELETE" ? null : "Type DELETE to confirm."),
    });
    if (r.value !== "ok") return;
    GT.clearAll(); ui.open = {}; ui.announced = {};
    applyTheme(); toast("All data cleared."); go("#/");
  };
  async function importFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast("That file is too large to be a backup.", "err");
    const text = await file.text();
    const v = GT.validateImport(text);
    if (!v.ok) return openModal({ title: "Can't import this file", body: `<p>${esc(v.error)}</p><p class="small muted">Nothing was changed.</p>`, actions: [{ label: "OK", value: "cancel", cls: "primary" }] });
    const r = await openModal({
      title: "Import backup?",
      body: `<p>This backup contains <b>${plural(v.summary.sessions, "completed workout")}</b>${v.summary.active ? ", 1 unfinished workout" : ""} and ${plural(v.summary.custom, "custom exercise")}${v.summary.savedAt ? `, saved ${fmtDateTime(v.summary.savedAt)}` : ""}.</p>
        ${v.dropped ? `<p class="banner warn" style="margin:0">${plural(v.dropped, "invalid workout")} will be skipped.</p>` : ""}
        <p>Importing <b>replaces everything</b> currently in this browser.</p>`,
      actions: [{ label: "Cancel", value: "cancel", cls: "ghost" }, { label: "Replace my data", value: "ok", cls: "danger" }],
    });
    if (r.value !== "ok") return;
    const ok = GT.replaceAll(v.data);
    ui.open = {}; ui.announced = {};
    applyTheme();
    toast(ok ? "Backup imported." : "Imported, but it couldn't be saved to storage.", ok ? "" : "err");
    go("#/");
  }

  // Profile fields
  function saveProfileField(el) {
    const k = el.dataset.pf, p = S().profile, st = S().settings, err = $("#pfErr");
    const fail = (msg) => { el.setAttribute("aria-invalid", "true"); err.textContent = msg; err.hidden = false; };
    el.removeAttribute("aria-invalid"); if (err) err.hidden = true;
    const n = GT.num(el.value);
    if (k === "bodyWeight") {
      const kg = GT.fromDisplay(el.value);
      if (el.value !== "" && !(kg >= 25 && kg <= 350)) return fail("Body weight should be between 25 and 350 kg.");
      p.bodyWeightKg = kg ? round(kg, 3) : null;
    } else if (k === "heightCm") { if (el.value !== "" && !(n >= 100 && n <= 250)) return fail("Height should be 100–250 cm."); p.heightCm = n; }
    else if (k === "age") { if (el.value !== "" && !(n >= 13 && n <= 100)) return fail("Age should be 13–100."); p.age = n; }
    else if (k === "defaultDurationMin") { if (!(n >= 10 && n <= 300)) return fail("Default duration should be 10–300 minutes."); p.defaultDurationMin = n; }
    else if (["sex", "goal"].includes(k)) p[k] = el.value;
    else if (k === "units") { p.units = el.value; GT.save(); render(); return; }
    else if (k === "theme") { st.theme = el.value; applyTheme(); }
    else if (k === "defaultIntensity") st.defaultIntensity = el.value;
    else if (["autoRest", "restSound", "includeActiveInTotals"].includes(k)) st[k] = el.checked;
    GT.save();
    toast("Saved.", "", 1200);
  }
  function applyTheme() {
    document.documentElement.dataset.theme = S().settings.theme;
    $("meta[name=theme-color]").setAttribute("content", S().settings.theme === "light" ? "#f2f4f7" : "#0b0f14");
  }

  // ---------- event wiring
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type !== "button")) return;
    const fn = A[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".ex-head")) { e.preventDefault(); A["ex-toggle"](e.target); }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.action === "set-done") return onSetDone(el);
    if (el.dataset.action === "ex-complete") return A["ex-complete"](el);
    if (el.dataset.action === "sess-intensity" || el.dataset.action === "rec-ex") return A[el.dataset.action](el);
    if (el.dataset.action === "import-file") { importFile(el.files[0]); el.value = ""; return; }
    if (el.dataset.pf) return saveProfileField(el);
    if (el.dataset.field === "rpe") return onSetInput(el);
  });
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.field === "w" || el.dataset.field === "r") return onSetInput(el);
    if (el.dataset.action === "lib-search") { lib.q = el.value; $("#libList").innerHTML = libraryList(); }
  });

  function onSetInput(el) {
    const s = currentSession(); if (!s) return;
    const row = el.closest(".set-row"), i = +row.dataset.i, j = +row.dataset.j, e = s.exercises[i], x = GT.curSets(e)[j];
    const f = el.dataset.field;
    if (f === "w") { const v = GT.fromDisplay(el.value); x.w = v !== null && v >= 0 ? v : null; }
    if (f === "r") { const v = GT.num(el.value); x.r = v !== null && v >= 0 ? Math.round(v) : null; }
    if (f === "rpe") x.rpe = GT.num(el.value);
    el.classList.toggle("bad", el.value !== "" && !el.checkValidity());
    changed(s);
    const vol = $("#vol-" + i); if (vol && GT.curEx(e).kind !== "time") vol.textContent = fmtVol(GT.exVolume(e));
    if (x.done) { checkPRs(s, i); }
  }
  function onSetDone(el) {
    const s = currentSession(); if (!s) return;
    unlockAudio();
    const row = el.closest(".set-row"), i = +row.dataset.i, j = +row.dataset.j, e = s.exercises[i], x = GT.curSets(e)[j];
    if (el.checked) {
      if (!(x.r > 0)) {
        el.checked = false; row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
        $("[data-field=r]", row).classList.add("bad");
        toast(`Enter the ${GT.curEx(e).kind === "time" ? "seconds held" : "reps completed"} before ticking the set.`, "err");
        return;
      }
      x.done = true; x.doneAt = new Date().toISOString();
      const ex = GT.curEx(e);
      if (!(x.w > 0) && ex.load !== "bodyweight" && ex.kind !== "time") toast("Set saved without a weight — it won't count toward volume or weight records.", "", 2600);
      if (s.status === "active" && S().settings.autoRest) {
        const allDone = GT.sessionStats(s).reqDone === GT.sessionStats(s).reqSets;
        if (!allDone) rest.start(GT.curTarget(e).rest, ex.name);
      }
    } else { x.done = false; x.doneAt = null; }
    changed(s);
    repaintCard(s, i);
    if (el.checked) checkPRs(s, i);
  }

  // ---------- clock
  function tick() {
    const act = GT.activeSession();
    if (act) {
      $$(`[data-elapsed="${act.id}"]`).forEach((el) => { el.textContent = fmtClock(GT.elapsedMs(act)); });
      const c = GT.liveCalories(act);
      $$(`[data-livekcal="${act.id}"]`).forEach((el) => { el.textContent = c ? fmtKcal(c.gross) : "add body weight in Profile"; });
    }
    rest.paint();
  }
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) GT.flush(); else tick(); });
  window.addEventListener("pagehide", () => GT.flush());

  // ---------- boot
  const problem = GT.load();
  if (problem) { const b = $("#loadWarn"); b.hidden = false; b.textContent = "⚠ " + problem; }
  applyTheme();
  try { localStorage.setItem("gymtrack:probe", "1"); localStorage.removeItem("gymtrack:probe"); }
  catch (e) { const b = $("#saveWarn"); b.hidden = false; b.textContent = "⚠ This browser is blocking storage, so workouts can't be saved. Turn off private browsing or allow site data."; }
  render();

  window.GTApp = { render, go };
})();
