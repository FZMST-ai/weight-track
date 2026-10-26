/*
 * End-to-end acceptance test (Playwright + Chromium).
 *   python3 -m http.server 8765      # from the repository root
 *   node gym/tests/e2e.js             # BASE_URL and SHOTS env vars are optional
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:8765/gym/";
const SHOTS = process.env.SHOTS || path.join(__dirname, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) failures++; };
const step = (msg) => console.log("\n" + msg);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  const waitState = (fn) => page.waitForFunction(`(${fn})(JSON.parse(localStorage.getItem("gymtrack:v1")))`, null, { timeout: 5000 }).then(() => true, () => false);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("gymtrack:v1")));
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true });
  const nav = async (name) => { await page.click(`.nav a[data-nav="${name}"]`); await page.waitForSelector(`.nav a[data-nav="${name}"][aria-current="page"]`); await page.waitForTimeout(50); };
  const modalBtn = (label) => page.locator("#modal .m-actions button:visible", { hasText: label }).first();

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  step("Profile");
  await nav("profile");
  await page.fill("#bodyWeight", "80");
  await page.locator("#bodyWeight").dispatchEvent("change");
  ok((await state()).profile.bodyWeightKg === 80, "body weight saved as 80 kg");

  step("1–2. Start Day 1, enter weights/reps, tick sets");
  await nav("dashboard");
  await shot("01-dashboard-empty");
  await page.click('[data-action="start"][data-day="d1"]');
  await page.waitForSelector(".sess-head");
  const nEx = await page.locator("#exList > article").count();
  ok(nEx === 5, "Day 1 has 5 exercise cards");
  const firstRows = await page.locator("#ex-0 .set-row").count();
  ok(firstRows === 3, "Machine Chest Press starts with 3 set rows");
  ok((await page.inputValue("#ex-0 .set-row >> nth=0 >> [data-field=r]")) === "10", "reps prefilled with 10");

  const weights = [40, 12, 30, 10, 25];
  for (let i = 0; i < nEx; i++) {
    const card = page.locator("#ex-" + i);
    if (!(await card.evaluate((el) => el.classList.contains("open")))) await card.locator(".ex-head").click();
    if (i === 1) {
      await page.click('#ex-1 [data-action="variant"][data-v="alt"]');
      ok((await page.textContent("#ex-1 .ex-name")).includes("Dumbbell Chest Fly"), "exercise 2 switched to Dumbbell Chest Fly");
    }
    const rows = page.locator(`#ex-${i} .set-row`);
    const n = await rows.count();
    for (let j = 0; j < n; j++) {
      await page.fill(`#ex-${i} .set-row >> nth=${j} >> [data-field=w]`, String(weights[i]));
      await page.fill(`#ex-${i} .set-row >> nth=${j} >> [data-field=r]`, "12");
    }
    if (i === 4) break; // leave the last exercise unticked for the persistence check
    for (let j = 0; j < n; j++) await page.locator(`#ex-${i} .set-row >> nth=${j} >> .tick`).click();
    const checked = await page.locator(`#ex-${i} [data-action="ex-complete"]`).isChecked();
    ok(checked, `exercise ${i + 1} completion checkbox ticked after all sets done`);
  }
  ok(!(await page.locator("#restBar").isHidden()), "rest timer appears after ticking a set");
  await page.click('[data-action="rest-pause"]');
  ok((await page.textContent("#restPause")) === "Resume", "rest timer pauses");
  await page.click('[data-action="rest-pause"]');
  await page.click('[data-action="rest-reset"]');
  await page.click('[data-action="rest-add"]');
  await shot("02-session-mobile");

  step("Skip a set: exercise 5 has 2 sets; tick one, skip the other");
  await page.locator("#ex-4 .set-row >> nth=0 >> .tick").click();
  await page.locator("#ex-4 .set-row >> nth=1 >> [data-action=set-menu]").click();
  await modalBtn("Skip set").click();
  const st5 = await page.textContent("#ex-4 .chip");
  ok(/Done/.test(st5), "exercise with one done + one skipped set counts as done");

  step("3. Refresh keeps unfinished workout");
  await page.click('[data-action="sess-pause"]');
  await page.reload();
  await page.waitForSelector(".sess-head");
  const s1 = await state();
  const act = s1.sessions.find((s) => s.id === s1.activeSessionId);
  ok(!!act, "active session restored after reload");
  ok(act.exercises[0].sets.primary.every((x) => x.done && x.w === 40 && x.r === 12), "set values persisted");
  ok(act.exercises[1].variant === "alt", "variant choice persisted");
  ok(!!act.pausedAt, "paused state persisted");
  await page.click('[data-action="sess-pause"]');

  step("Skip exercise doesn't count sets");
  // Untick the done set on exercise 5 and skip the exercise instead.
  if (!(await page.locator("#ex-4").evaluate((el) => el.classList.contains("open")))) await page.locator("#ex-4 .ex-head").click();
  await page.click('#ex-4 [data-action="ex-skip"]');
  ok(/Skipped/.test(await page.textContent("#ex-4 .chip")), "exercise 5 marked skipped");

  step("4–5. Finish workout, calories use body weight × MET × duration");
  await page.click('.sess-head [data-action="sess-finish"]');
  await page.fill("#fDur", "60");
  await page.selectOption("#fInt", "moderate");
  const est = await page.textContent("#fKcal");
  ok(/294 kcal/.test(est), "finish dialog shows ≈294 kcal (3.5 × 3.5 × 80 ÷ 200 × 60): " + est.trim().slice(0, 40));
  await shot("03-finish-dialog");
  await modalBtn("Save workout").click();
  await page.waitForURL(/#\/history\//);
  const s3 = await state();
  const done1 = s3.sessions.find((s) => s.status === "completed");
  ok(done1 && Math.round(done1.calories.gross) === 294, "saved gross calories = 294");
  ok(done1 && Math.round(done1.calories.active) === 210, "saved active calories = 210");
  const stats1 = await page.textContent("main");
  ok(/4 done · 1 skipped/.test(stats1), "history detail: 4 exercises done, 1 skipped");
  ok(/Sets completed\s*10/.test(stats1), "10 completed sets: 3+2+3+2, skipped exercise not counted");
  await shot("04-history-detail");

  step("6. Weekly / monthly totals, no double counting after edit");
  await nav("dashboard");
  let dash = (await page.innerText("main")).replace(/\s+/g, " ");
  ok(/Est\. calories \(week\) ?294 ?kcal/.test(dash), "week calories = 294");
  ok(/month 294 kcal/.test(dash), "month calories = 294");
  ok(/1\/5 ?days done/.test(dash), "weekly indicator 1/5");
  // Edit the completed workout (duration 30) — should replace, not add
  await page.goto(BASE + "#/history/" + done1.id);
  await page.click('[data-action="hist-meta"]');
  await page.fill("#mDur", "30");
  await modalBtn("Save").click();
  await nav("dashboard");
  dash = (await page.innerText("main")).replace(/\s+/g, " ");
  ok(/Est\. calories \(week\) ?147 ?kcal/.test(dash), "after editing to 30 min, week calories = 147 (replaced, not added)");
  ok(/Workouts completed ?1 /.test(dash), "still 1 completed workout");
  // Edit sets of completed workout: no duplicate session
  await page.goto(BASE + "#/edit/" + done1.id);
  await page.waitForSelector(".sess-head");
  if (!(await page.locator("#ex-0").evaluate((el) => el.classList.contains("open")))) await page.locator("#ex-0 .ex-head").click();
  await page.fill("#ex-0 .set-row >> nth=2 >> [data-field=r]", "11");
  await page.click('.sess-head a.btn.primary');
  const s4 = await state();
  ok(s4.sessions.filter((s) => s.status === "completed").length === 1, "editing a completed workout doesn't duplicate it");
  ok(s4.sessions[0].exercises[0].sets.primary[2].r === 11, "edited reps saved");
  await shot("05-dashboard-after-1");

  step("7. New personal best keeps old and new records");
  await page.goto(BASE + "#/workouts/d1");
  await page.click('[data-action="start"][data-day="d1"]');
  await page.waitForSelector(".sess-head");
  const sugg = await page.textContent("#ex-0");
  ok(/Consider increasing the weight slightly|Try to add a rep/.test(sugg), "progression suggestion shown");
  ok((await page.inputValue("#ex-0 .set-row >> nth=0 >> [data-field=w]")) === "40", "weight prefilled from last session (not increased)");
  await page.fill("#ex-0 .set-row >> nth=0 >> [data-field=w]", "45");
  await page.fill("#ex-0 .set-row >> nth=0 >> [data-field=r]", "10");
  await page.locator("#ex-0 .set-row >> nth=0 >> .tick").click();
  await page.waitForSelector(".toast.pb");
  ok(true, "PB toast shown");
  ok((await page.locator("#ex-0 .pb-badge").count()) > 0, "PB badge on exercise card");
  await shot("06-pb-toast");
  await page.click('.sess-head [data-action="sess-finish"]');
  await page.fill("#fDur", "45");
  await modalBtn("Save workout").click();
  await page.waitForURL(/#\/history\//);
  const s5 = await state();
  const hist = s5.records.history.filter((h) => h.exId === "machine-chest-press" && h.type === "maxW");
  ok(hist.length === 2 && hist[0].value === 40 && hist[1].value === 45 && hist[1].prev === 40, "record history keeps 40 kg baseline and 45 kg PB (prev 40)");
  await nav("records");
  await shot("07-records");
  const rec = (await page.textContent("main")).replace(/\s+/g, " ");
  ok(/40 kg → 45 kg/.test(rec), "records page shows 40 kg → 45 kg");

  step("8. Variant tracked separately");
  ok(!!s5.records.best["db-chest-fly"] && !s5.records.best["pec-deck"], "Dumbbell Chest Fly has records; Pec Deck does not");

  step("Weekly totals with two sessions");
  await nav("dashboard");
  dash = (await page.innerText("main")).replace(/\s+/g, " ");
  const expect2 = Math.round(3.5 * 3.5 * 80 / 200 * 30 + 3.5 * 3.5 * 80 / 200 * 45);
  ok(new RegExp(`Est\\. calories \\(week\\) ?${expect2} ?kcal`).test(dash), `week calories = ${expect2} after second workout`);

  step("9. Export, clear, import");
  await nav("profile");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-action="export-json"]')]);
  const file = path.join(SHOTS, "backup.json");
  await dl.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  ok(backup.app === "gym-tracker" && backup.sessions.length === 2, "backup has 2 sessions");
  const [csv] = await Promise.all([page.waitForEvent("download"), page.click('[data-action="export-csv"][data-kind="sets"]')]);
  const csvText = fs.readFileSync(await csv.path(), "utf8");
  ok(csvText.split("\n").length > 10 && csvText.startsWith("session_id"), "set-level CSV exported");
  await page.click('[data-action="clear-all"]');
  await modalBtn("Clear everything").click();
  ok(await page.locator(".m-err:visible").count() === 1, "clear requires typing DELETE");
  await page.fill("#cConfirm", "delete");
  await modalBtn("Clear everything").click();
  ok(await waitState("s => s.sessions.length === 0"), "data cleared");
  // invalid import is rejected without changes
  const bad = path.join(SHOTS, "bad.json");
  fs.writeFileSync(bad, JSON.stringify({ hello: "world" }));
  await nav("profile");
  await page.setInputFiles("#importFile", bad);
  await page.waitForSelector("#modal[open]");
  ok(/isn't a Gym Tracker backup/.test(await page.textContent("#modal")), "invalid file rejected");
  await modalBtn("OK").click();
  await page.setInputFiles("#importFile", file);
  await page.waitForSelector("#modal[open]");
  ok(/2 completed workouts/.test(await page.textContent("#modal")), "import preview shows 2 workouts");
  await modalBtn("Replace my data").click();
  ok(await waitState("s => s.sessions.length === 2 && s.profile.bodyWeightKg === 80"), "backup restored");

  step("Library, templates, custom exercise");
  await nav("library");
  await page.fill(".search", "triceps");
  const libCount = await page.locator("#libList article").count();
  ok(libCount >= 4, `search "triceps" finds ${libCount} exercises`);
  await page.fill(".search", "");
  await page.click('[data-action="lib-filter"][data-eq="cable"]');
  const cables = await page.locator("#libList .chip", { hasText: "Cable" }).count();
  ok(cables === (await page.locator("#libList article").count()), "cable filter shows only cable exercises");
  await page.click('[data-action="lib-filter"][data-eq="all"]');
  await shot("08-library");
  await page.click('[data-action="custom-new"]');
  await page.fill("#x_name", "Smith Machine Squat");
  await page.selectOption("#x_add", "d3");
  await modalBtn("Create exercise").click();
  ok(await waitState("s => s.templates[2].slots.length === 6"), "custom exercise added to Day 3");
  await page.goto(BASE + "#/workouts/d1");
  await page.click('[data-action="slot-edit"][data-slot="d1s1"]');
  await page.fill("#sS", "4");
  await modalBtn("Save").click();
  ok(await waitState("s => s.templates[0].slots[0].sets === 4"), "edited sets to 4");
  ok((await state()).sessions.every((s) => s.exercises[0].sets.primary.filter((x) => !x.extra).length === 3), "history keeps 3 sets");
  await page.click('[data-action="slot-edit"][data-slot="d1s1"]');
  await modalBtn("Reset to defaults").click();
  ok(await waitState("s => s.templates[0].slots[0].sets === 3"), "reset slot to 3 sets");

  step("Lightbox & images");
  await page.goto(BASE + "#/library");
  await page.locator(".thumb").first().click();
  ok(await page.locator("#lightbox[open]").count() === 1, "image enlarges");
  await page.click("#lightbox .lb-close");
  const broken = await page.evaluate(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && !i.hidden).length);
  ok(broken === 0, "no broken images in library");

  step("10. Desktop layout & all pages");
  for (const [w, h, tag] of [[390, 844, "mobile"], [1280, 860, "desktop"]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const nav of ["dashboard", "workouts", "records", "history", "library", "profile"]) {
      await page.click(`.nav a[data-nav="${nav}"]`);
      await page.waitForTimeout(100);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const wide = overflow ? await page.evaluate(() => Array.from(document.querySelectorAll("main *")).filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 3).map((e) => e.className || e.tagName).join(", ")) : "";
      ok(!overflow, `${tag} ${nav}: no horizontal overflow ${wide}`);
      await shot(`10-${tag}-${nav}`);
    }
  }
  await page.goto(BASE + "#/workouts/d4");
  await page.click('[data-action="start"][data-day="d4"]');
  await page.waitForSelector(".sess-head");
  await shot("11-desktop-session");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(100);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "mobile session: no horizontal overflow");
  await shot("12-mobile-session-d4");

  step("Theme");
  await nav("profile");
  await page.selectOption("#theme", "light");
  ok((await page.getAttribute("html", "data-theme")) === "light", "light theme applied");
  await nav("dashboard");
  await shot("13-light-dashboard");

  step("12. Console errors");
  ok(errors.length === 0, "no console errors" + (errors.length ? ": " + errors.join(" | ") : ""));

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
