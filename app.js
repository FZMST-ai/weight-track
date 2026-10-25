(() => {
  const KG_PER_LB = 0.45359237;
  const $ = (id) => document.getElementById(id);
  const state = { entries: [], unit: "kg", goalKg: null, range: 90, user: null, confirming: null, channel: null };
  let sb = null;

  const today = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  $("date").value = today();

  const toUnit = (kg) => state.unit === "kg" ? kg : kg / KG_PER_LB;
  const toKg = (v) => state.unit === "kg" ? v : v * KG_PER_LB;
  const fmt = (kg) => toUnit(kg).toFixed(1);
  const fmtDelta = (kg) => {
    const v = toUnit(kg);
    const s = (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(1);
    return `<span class="${v < 0 ? "down" : v > 0 ? "up" : ""}">${s}</span>`;
  };
  const fmtDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const dayNum = (iso) => Math.round(new Date(iso + "T12:00:00").getTime() / 86400000);

  function setSync(s, text) { $("sync").dataset.state = s; $("syncText").textContent = text; }

  // 7-day trailing average for each entry (entries sorted ascending).
  function movingAvg(entries) {
    return entries.map((e, i) => {
      const end = dayNum(e.date);
      let sum = 0, n = 0;
      for (let j = i; j >= 0 && end - dayNum(entries[j].date) < 7; j--) { sum += entries[j].kg; n++; }
      return sum / n;
    });
  }

  function render() {
    const es = state.entries;
    const u = state.unit;
    $("unitBig").textContent = u; $("unitLabel").textContent = u;
    $("unit").value = u;
    if (document.activeElement !== $("goal")) $("goal").value = state.goalKg ? fmt(state.goalKg) : "";

    if (!es.length) {
      $("current").firstChild.nodeValue = "—";
      $("currentSub").textContent = "Log your first weight below. It syncs to every device you sign in on.";
      ["avg7", "chg30", "toGoal"].forEach((id) => $(id).textContent = "—");
    } else {
      const last = es[es.length - 1];
      const avgs = movingAvg(es);
      $("current").firstChild.nodeValue = fmt(last.kg);
      const prev = es[es.length - 2];
      $("currentSub").innerHTML = fmtDate(last.date) + (prev ? ` · ${fmtDelta(last.kg - prev.kg)} ${u} since ${fmtDate(prev.date)}` : "");
      $("avg7").textContent = fmt(avgs[avgs.length - 1]);
      const cutoff = dayNum(last.date) - 30;
      const base = es.find((e) => dayNum(e.date) >= cutoff);
      $("chg30").innerHTML = base && base !== last ? fmtDelta(last.kg - base.kg) : "—";
      $("toGoal").textContent = state.goalKg ? (Math.abs(last.kg - state.goalKg) < 0.05 ? "Reached" : fmt(Math.abs(last.kg - state.goalKg))) : "—";
    }
    renderChart();
    renderList();
  }

  function renderChart() {
    const all = state.entries;
    const box = $("chart");
    let es = all;
    if (state.range && all.length) {
      const cut = dayNum(all[all.length - 1].date) - state.range;
      es = all.filter((e) => dayNum(e.date) >= cut);
    }
    if (es.length < 2) { box.innerHTML = `<div class="empty">Your trend line appears after two weigh-ins${state.range && all.length >= 2 ? " in this range" : ""}.</div>`; return; }
    const avgs = movingAvg(all).slice(all.length - es.length);
    const W = 600, H = 260, L = 52, R = 14, T = 14, B = 34;
    const xs = es.map((e) => dayNum(e.date));
    const x0 = xs[0], x1 = xs[xs.length - 1];
    const vals = es.map((e) => toUnit(e.kg));
    if (state.goalKg) vals.push(toUnit(state.goalKg));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.12, 0.5); lo -= pad; hi += pad;
    const step = niceStep((hi - lo) / 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = (d) => L + (d - x0) / (x1 - x0) * (W - L - R);
    const Y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
    let g = "";
    for (let v = lo; v <= hi + 1e-9; v += step) {
      g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/>`;
      g += `<text x="${L - 6}" y="${Y(v) + 5}" text-anchor="end">${+v.toFixed(1)}</text>`;
    }
    const fmtShort = (d) => new Date(d * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    g += `<text x="${L}" y="${H - 6}" text-anchor="start">${fmtShort(x0)}</text>`;
    g += `<text x="${W - R}" y="${H - 6}" text-anchor="end">${fmtShort(x1)}</text>`;
    if (state.goalKg) {
      const gy = Y(toUnit(state.goalKg));
      g += `<line x1="${L}" x2="${W - R}" y1="${gy}" y2="${gy}" stroke="var(--good)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    }
    const line = avgs.map((a, i) => `${i ? "L" : "M"}${X(xs[i]).toFixed(1)},${Y(toUnit(a)).toFixed(1)}`).join("");
    const area = `${line}L${X(x1).toFixed(1)},${H - B}L${X(x0).toFixed(1)},${H - B}Z`;
    g += `<path d="${area}" fill="var(--accent-soft)" opacity="0.7"/>`;
    g += es.map((e, i) => `<circle cx="${X(xs[i]).toFixed(1)}" cy="${Y(toUnit(e.kg)).toFixed(1)}" r="2.6" fill="var(--muted)" opacity="0.65"><title>${fmtDate(e.date)}: ${fmt(e.kg)} ${state.unit}</title></circle>`).join("");
    g += `<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    g += `<circle cx="${X(x1)}" cy="${Y(toUnit(avgs[avgs.length - 1]))}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend chart">${g}</svg>`;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function renderList() {
    const es = state.entries;
    const list = $("list");
    if (!es.length) { list.innerHTML = `<li class="empty">No weigh-ins yet.</li>`; return; }
    list.innerHTML = "";
    for (let i = es.length - 1; i >= 0; i--) {
      const e = es[i], prev = es[i - 1];
      const li = document.createElement("li");
      const left = document.createElement("div");
      left.innerHTML = `<div class="date">${fmtDate(e.date)}</div>`;
      if (e.note) { const n = document.createElement("div"); n.className = "note"; n.textContent = e.note; left.appendChild(n); }
      const w = document.createElement("div");
      w.className = "w";
      w.innerHTML = `${fmt(e.kg)} ${state.unit}<span class="d">${prev ? fmtDelta(e.kg - prev.kg) : "&nbsp;"}</span>`;
      const act = document.createElement("div");
      if (state.confirming === e.date) {
        act.className = "confirm";
        act.innerHTML = `<button class="ghost no" type="button">Keep</button><button class="yes" type="button">Delete</button>`;
        act.querySelector(".no").onclick = () => { state.confirming = null; renderList(); };
        act.querySelector(".yes").onclick = () => remove(e.date);
      } else {
        act.innerHTML = `<button class="del" type="button" aria-label="Delete entry for ${fmtDate(e.date)}">×</button>`;
        act.querySelector("button").onclick = () => { state.confirming = e.date; renderList(); };
      }
      li.append(left, w, act);
      list.appendChild(li);
    }
  }

  // ---- Supabase data ----
  async function load() {
    const [entries, profile] = await Promise.all([
      sb.from("entries").select("date, kg, note").order("date", { ascending: true }),
      sb.from("profiles").select("unit, goal_kg").maybeSingle(),
    ]);
    if (entries.error || profile.error) { setSync("off", "Couldn't load. Check your connection."); return; }
    state.entries = entries.data.map((r) => ({ date: r.date, kg: Number(r.kg), note: r.note || "" }));
    if (profile.data) {
      state.unit = profile.data.unit === "lb" ? "lb" : "kg";
      state.goalKg = profile.data.goal_kg == null ? null : Number(profile.data.goal_kg);
    }
    setSync("live", "Synced");
    render();
  }

  // Reload when another device changes something. Coalesces bursts into one fetch.
  let reloadTimer = null;
  const scheduleReload = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(load, 250); };

  function subscribe() {
    unsubscribe();
    const filter = `user_id=eq.${state.user.id}`;
    state.channel = sb.channel(`weights-${state.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "entries", filter }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter }, scheduleReload)
      .subscribe();
  }
  function unsubscribe() {
    if (state.channel) { sb.removeChannel(state.channel); state.channel = null; }
  }

  async function saving(fn, okText) {
    setSync("saving", "Saving…");
    const { error } = await fn();
    if (error) { setSync("off", "Couldn't save. Try again."); return false; }
    setSync("live", okText || "Synced");
    return true;
  }

  const saveProfile = () => saving(() => sb.from("profiles").upsert({ user_id: state.user.id, unit: state.unit, goal_kg: state.goalKg }));

  $("form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const v = parseFloat($("weight").value);
    const date = $("date").value;
    if (!isFinite(v) || !date) return;
    const kg = Math.round(toKg(v) * 1000) / 1000;
    const note = $("note").value.trim();
    $("save").disabled = true;
    const ok = await saving(() => sb.from("entries").upsert({ user_id: state.user.id, date, kg, note, updated_at: new Date().toISOString() }), "Saved and synced");
    $("save").disabled = false;
    if (!ok) return;
    const others = state.entries.filter((e) => e.date !== date);
    state.entries = [...others, { date, kg, note }].sort((a, b) => a.date < b.date ? -1 : 1);
    $("weight").value = ""; $("note").value = ""; $("date").value = today();
    render();
  });

  async function remove(date) {
    state.confirming = null;
    const ok = await saving(() => sb.from("entries").delete().eq("date", date), "Deleted");
    if (ok) state.entries = state.entries.filter((e) => e.date !== date);
    render();
  }

  $("unit").addEventListener("change", () => { state.unit = $("unit").value; render(); saveProfile(); });
  $("goal").addEventListener("change", () => {
    const v = parseFloat($("goal").value);
    state.goalKg = isFinite(v) && v > 0 ? Math.round(toKg(v) * 1000) / 1000 : null;
    render(); saveProfile();
  });
  document.querySelectorAll(".ranges button").forEach((b) => b.addEventListener("click", () => {
    state.range = +b.dataset.days;
    document.querySelectorAll(".ranges button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    try { localStorage.setItem("wl-range", b.dataset.days); } catch {}
    renderChart();
  }));
  try {
    const r = localStorage.getItem("wl-range");
    if (r !== null) document.querySelector(`.ranges button[data-days="${r}"]`)?.click();
  } catch {}

  // ---- Auth ----
  function authMsg(text, isError) { $("authMsg").textContent = text; $("authMsg").classList.toggle("error", !!isError); }
  const creds = () => ({ email: $("email").value.trim(), password: $("password").value });

  $("authForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    authMsg("Signing in…");
    const { error } = await sb.auth.signInWithPassword(creds());
    if (error) authMsg(error.message === "Invalid login credentials" ? "Email or password is wrong." : error.message, true);
  });
  $("signUp").addEventListener("click", async () => {
    if (!$("authForm").reportValidity()) return;
    authMsg("Creating account…");
    const { data, error } = await sb.auth.signUp({ ...creds(), options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) return authMsg(error.message, true);
    if (!data.session) authMsg("Check your email for a confirmation link, then sign in here.");
  });
  $("signOut").addEventListener("click", () => sb.auth.signOut());

  function showSignedIn(user) {
    const changed = state.user?.id !== user.id;
    state.user = user;
    $("authPanel").hidden = true;
    $("app").hidden = false;
    $("signOut").hidden = false;
    $("who").textContent = `Signed in as ${user.email}`;
    if (changed) { setSync("connecting", "Loading…"); load(); subscribe(); }
  }
  function showSignedOut() {
    unsubscribe();
    state.user = null;
    state.entries = []; state.goalKg = null; state.unit = "kg";
    $("app").hidden = true;
    $("signOut").hidden = true;
    $("authPanel").hidden = false;
    $("password").value = "";
    authMsg("");
    setSync("off", "Signed out");
  }

  const cfg = window.WEIGHT_LOG_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    $("setup").hidden = false;
    setSync("off", "Not connected");
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  sb.auth.onAuthStateChange((_event, session) => {
    // Defer so Supabase calls aren't made inside the auth callback.
    setTimeout(() => session ? showSignedIn(session.user) : showSignedOut(), 0);
  });
  // Catch up when the tab comes back into view, in case realtime missed something.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.user) load(); });
})();
