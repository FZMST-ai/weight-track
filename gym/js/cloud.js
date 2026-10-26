/*
 * Optional cloud sync, active only when the app runs as a claude.ai Artifact
 * (window.claude present and the `db` + `user` capabilities granted).
 * Elsewhere this file does nothing and localStorage stays the only store.
 *
 * Layout in the viewer's private subtree (nobody else can read it):
 *   data/users/<id>/app                 { savedAt, core }   core = state minus sessions/records
 *   data/users/<id>/app/sessions/<sid>  { savedAt, session }
 * Records are not stored; they are rebuilt from sessions on load.
 * Whichever side saved last wins on load; after that, every local save is
 * pushed (debounced), writing only documents whose content changed.
 */
(function () {
  if (!window.claude || typeof window.claude.use !== "function") return;

  const CORE_KEYS = ["app", "schema", "profile", "settings", "exerciseOverrides", "customExercises", "templates", "activeSessionId", "restTimer"];
  let appRef = null, sessCol = null, ready = false;
  const pushed = { core: null, sessions: {} };
  let timer = null, chain = Promise.resolve(), failed = false;

  const core = (s) => { const c = {}; CORE_KEYS.forEach((k) => { c[k] = s[k]; }); return c; };
  const status = (text, warn) => { const el = document.getElementById("syncNote"); if (el) { el.textContent = text; el.dataset.warn = warn ? "1" : ""; } window.GT_SYNC = { text, warn: !!warn }; };

  async function start() {
    const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    if (!db || !user) return status("Saved in this browser only.", false);
    const uid = await user.id();
    if (!uid) return status("Sign in to sync your workouts. For now they're saved in this browser only.", true);
    appRef = db.doc("data/users/" + uid + "/app");
    sessCol = appRef.collection("sessions");

    let remote, remoteSessions;
    try {
      remote = await appRef.get();
      remoteSessions = remote.exists ? (await sessCol.limit(1000).get()).docs.map((d) => d.data()) : [];
    } catch (e) { return status("Couldn't reach cloud storage, so changes are saved in this browser only.", true); }

    const local = GT.state;
    const remoteAt = remote.exists ? remote.data().savedAt || "" : "";
    const localHasData = local.sessions.length > 0 || !!local.profile.bodyWeightKg || !!local.savedAt;
    if (remote.exists && (!localHasData || remoteAt > (local.savedAt || ""))) {
      const next = Object.assign({}, remote.data().core, { sessions: remoteSessions.map((d) => d.session).filter(Boolean), savedAt: remoteAt });
      GT.adopt(next);
      pushed.core = JSON.stringify(core(GT.state));
      remoteSessions.forEach((d) => { if (d.session) pushed.sessions[d.session.id] = JSON.stringify(d.session); });
      if (window.GTApp) window.GTApp.render();
    } else if (remote.exists) {
      remoteSessions.forEach((d) => { if (d.session) pushed.sessions[d.session.id] = JSON.stringify(d.session); });
      pushed.core = JSON.stringify(core(remote.data().core || {}));
    }
    ready = true;
    status("Synced to your account.", false);
    GT.onSave(() => schedule());
    schedule(0);
  }

  function schedule(ms = 1500) {
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(() => { chain = chain.then(push, push); }, ms);
  }

  async function push() {
    const s = GT.state, at = s.savedAt || new Date().toISOString();
    try {
      for (const sess of s.sessions) {
        const j = JSON.stringify(sess);
        if (pushed.sessions[sess.id] === j) continue;
        await sessCol.doc(sess.id).set({ savedAt: at, session: JSON.parse(j) });
        pushed.sessions[sess.id] = j;
      }
      const ids = new Set(s.sessions.map((x) => x.id));
      for (const id of Object.keys(pushed.sessions)) {
        if (ids.has(id)) continue;
        await sessCol.doc(id).delete();
        delete pushed.sessions[id];
      }
      const c = JSON.stringify(core(s));
      // The core doc carries savedAt, so it's written last: a load only trusts it once sessions are up.
      if (pushed.core !== c || failed) { await appRef.set({ savedAt: at, core: JSON.parse(c) }); pushed.core = c; }
      if (failed) { failed = false; status("Synced to your account.", false); }
    } catch (e) {
      failed = true;
      status(e && e.code === "quota_exceeded" ? "Cloud storage is full. Changes are saved in this browser only; export a backup." : "Couldn't sync just now. Changes are saved in this browser and will sync when possible.", true);
      if (e && (e.code === "unavailable" || e.code === "resource_exhausted")) schedule(15000);
    }
  }

  window.addEventListener("load", () => setTimeout(start, 0));
})();
