# Gym Tracker

A five-day gym workout tracker for people who mostly use machines and want a free-weight alternative for every exercise. It's plain HTML, CSS and JavaScript with no build step, backend, account or API key. Your data stays in your browser (`localStorage`).

- Dashboard with this week's progress (for example 3/5 days), completed workouts, exercises, estimated calories, workout time, recent personal bests, the latest workout and an 8-week consistency chart
- The five-day programme preloaded, with a machine and a free-weight/bodyweight option for every exercise
- Set-by-set logging of weight, reps (or seconds), optional RPE and done status. You can add, skip and delete sets, skip an exercise, and switch variant at any point
- Workout timer you can pause and resume, plus a rest timer that starts when you tick a set (pause, reset, +15 s)
- Personal records for each exercise variant, with a full history of past records
- Progression suggestions based on your last session. The app never changes your weights for you
- MET-based calorie estimates for each session, week and month
- History you can inspect and edit without creating a duplicate workout
- Exercise library with search, equipment filters, technique notes, editable prescriptions, custom exercises and alternatives
- JSON backup and restore, and CSV export
- Dark mode by default, with a light mode. Bottom navigation on phones, sidebar on desktop

## Run it locally

Serve the repository root with any static server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/gym/>. The Weight Log app stays at <http://localhost:8000/>.

You can also open `gym/index.html` straight from disk (`file://`). Everything works, but some browsers keep separate `localStorage` for files opened this way, so stick to one method.

On GitHub Pages the app is at `https://<your-username>.github.io/weight-track/gym/`. On iPhone, open it in Safari and choose **Share → Add to Home Screen** for a full-screen app.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell: navigation, dialogs, rest-timer bar, icon sprite |
| `styles.css` | All styles. Mobile first, with dark and light themes |
| `js/data.js` | The built-in programme and exercise library (technique, muscles, image mapping) |
| `js/store.js` | Data model, `localStorage` persistence, calculations (volume, 1RM, records, calories, totals), import/export |
| `js/app.js` | Router, views and event handling |
| `img/<Exercise_Id>/0.jpg, 1.jpg` | Bundled exercise photos showing the start and end positions |
| `tests/e2e.js` | Playwright acceptance test |

## Backing up and restoring

Data lives only in the browser you use. Clearing site data, using private browsing or switching browsers or devices means starting from empty, so export a backup now and then.

- **Back up:** Profile → **Export backup (JSON)**. This downloads `gym-tracker-backup-YYYY-MM-DD.json` with everything in it: profile, settings, templates, custom exercises, workouts, sets and records.
- **Restore:** Profile → **Import backup…** and choose the JSON file. The file is checked first: it must be a Gym Tracker backup with a supported schema, and invalid workouts are listed and skipped. You see a summary and confirm before anything is replaced. The data you had before the import is also kept in `localStorage` under `gymtrack:v1:before-import`.
- **Spreadsheet export:** **History CSV** gives one row per workout. **Set-level CSV** gives one row per set.
- **Clear all data:** Profile → **Clear all data…**, then type `DELETE` to confirm.

If saving ever fails (storage full or blocked), a warning banner appears at the top of the page.

## How calories are estimated

All estimates use the standard MET formula:

```
gross kcal  = MET × 3.5 × body weight (kg) ÷ 200 × duration (min)
active kcal = max(0, (MET − 1) × 3.5 × body weight (kg) ÷ 200 × duration (min))
```

- MET values for resistance training are light 3.0, moderate 3.5 (the default) and vigorous 6.0. You pick the intensity for each workout.
- **Duration** is the time recorded from the moment you start the workout until you finish it, including rest and excluding paused time. You can correct it before saving, for example if you forgot to stop the timer, and edit it later from History. If the timer recorded under a minute, the app asks you to enter the duration instead of guessing. The default duration in Profile is used only for the planned estimate on a day's page and to flag a timer that ran unusually long.
- **Body weight** comes from Profile. A finished workout keeps the body weight it was saved with, so updating your weight later doesn't rewrite old estimates. You can still edit a workout's value in History.
- **Dashboard, weekly, monthly and history totals all use gross calories.** Active calories are shown next to gross for each workout.
- Only completed workouts count. Each workout is counted once by its ID, so editing or reopening one replaces its estimate and never adds a second copy. Workouts are dated by the local calendar day they started, so a session that runs past midnight counts on its start day. An in-progress workout is left out unless you turn on **Include the in-progress workout in dashboard totals**.
- Per-exercise figures are rough splits based on the time between the first and last completed set.

**Limitations:** MET values are population averages. Real energy use depends on your effort, rest length, fitness, body composition and more. These numbers are estimates, not measurements, and the app never treats them as exact. Sets, reps and weights aren't used to calculate calories, because they can't predict energy use accurately.

## Weights, records and progression

- Weights are stored in kg. If you choose lb in Profile, the app converts for display.
- **Dumbbell exercises:** for two-dumbbell movements (bench press, curls, rows and so on), the weight is **one dumbbell**, the number printed on it. For single-dumbbell movements (goblet squat, overhead extension, pullover, glute bridge, weighted crunch), it's the weight of that one dumbbell. Volume and 1RM use the number you enter, so results are consistent within each exercise. The set table's column header (`kg/DB` or `kg`) and the note under each exercise remind you which convention applies.
- **Bodyweight exercises:** the weight is added load only (0 = bodyweight). The plank is logged in seconds.
- **Volume** = the sum of weight × reps over completed sets. Skipped sets and skipped exercises don't count.
- **Exercise completion:** an exercise is complete when every prescribed set is done (a set you mark as skipped is no longer required) and at least one set is done, or when you mark the whole exercise as skipped. Skipped exercises are counted separately and never as completed.
- **Records**, tracked separately for every exercise and variant:
  - Heaviest completed set
  - Most reps at a given weight (only compared at that exact weight)
  - Highest estimated 1RM, using the Epley formula `weight × (1 + reps ÷ 30)`. This is only calculated for loaded sets of 1–20 reps, never for timed exercises or bodyweight-only sets
  - Highest single-session volume
  - Longest hold, for timed exercises
- Records only come from completed sets in completed workouts. The first time you log an exercise sets a baseline, which is kept in the record history but isn't celebrated as a PB. Records are rebuilt from your workout history whenever a workout is finished, edited or deleted, so there are no stale or duplicate records. Every past record, with its date and previous value, stays in the record history.
- **Progression suggestions** compare your last session with the target rep range. For example: "You completed 3 × 12 at 30 kg last session. Consider increasing the weight slightly next session if your form was good." New sets are prefilled with last session's weights, never increased automatically.

## Editing the programme

From **Workouts → a day**, or **Library → Edit sets/reps/rest**, you can change an exercise's main and alternative exercise, sets, rep range and rest. You can also reorder, remove or add exercises, and reset an exercise or a whole day to the programme defaults. Workouts store a snapshot of what you did, so template changes never alter history. Library edits (name, muscles, technique, image URL) can be reset to the built-in defaults too.

## Exercise images

The photos are real exercise photographs from **[Free Exercise DB](https://github.com/yuhonas/free-exercise-db)** by yuhonas, released into the public domain under the [Unlicense](https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md). They're **bundled in `img/`** (resized to 640 px wide). The app makes no external image requests and needs no API.

The dataset has no exact photo for some exercises, so a closely related movement is shown instead. These are labelled **"Similar"** in the app, with a note explaining the difference:

| Exercise | Photo used |
|---|---|
| Machine Lateral Raise, Single-Arm Cable Lateral Raise | Seated cable lateral raise |
| Dumbbell Rear-Delt Row | Barbell rear-delt row |
| Dumbbell Goblet Squat | Kettlebell goblet squat |
| Dumbbell Romanian Deadlift | Stiff-legged dumbbell deadlift |
| Glute Drive / Hip Thrust Machine | Barbell hip thrust |
| Dumbbell Glute Bridge | Barbell glute bridge |
| Weighted Crunch | Weighted crunch with a medicine ball |
| Chest-Supported Row Machine | Chest-supported T-bar row machine |
| Side-Lying Hip Abduction / Cable Hip Abduction | Standing side leg raise |

Every exercise has an optional **Image URL** field (Library → Edit details) for using your own image. If an image fails to load, a clean fallback with an icon and the exercise name appears instead. Tap any image to enlarge it and see the start and end positions.

## Data model

Everything is one JSON document in `localStorage` under the key `gymtrack:v1`:

```
{
  app: "gym-tracker", schema: 1, savedAt,
  profile:   { bodyWeightKg, heightCm, age, sex, goal, units, defaultDurationMin },
  settings:  { theme, defaultIntensity, includeActiveInTotals, autoRest, restSound },
  exerciseOverrides: { [exerciseId]: { name?, muscles?, technique?, imageUrl? } },
  customExercises:   { [id]: { id, name, equipment, kind, load, muscles, technique, imageUrl } },
  templates: [ { id, name, muscles, slots: [ { id, primary, alt, sets, repsMin, repsMax, rest, perSide } ] } ],
  sessions:  [ { id, dayId, dayName, dayNumber, status: "active" | "completed",
                 startedAt, endedAt, localDate, pausedMs, pausedAt,
                 durationMin, durationEdited, intensity, bodyWeightKg,
                 calories: { met, gross, active },
                 exercises: [ { slotId, variant: "primary" | "alt", skipped,
                                primary: {id, name, equipment, kind, load}, alt: {…},
                                target: { primary: {sets, repsMin, repsMax, rest, perSide}, alt: {…} },
                                sets: { primary: [ {w, r, rpe, done, skipped, extra, doneAt} ], alt: [ … ] } } ] } ],
  records:   { history: [ { type, exId, name, value, prev, date, sessionId, first } ], best: { … } },
  activeSessionId, restTimer
}
```

Timestamps are ISO 8601 (`toISOString`). `localDate` is the local calendar day (`YYYY-MM-DD`) the workout started on, and it's used for all weekly and monthly grouping (weeks run Monday to Sunday). Missing or invalid fields are filled with defaults when the app loads. If saved data can't be read at all, it's kept under `gymtrack:v1:corrupt` and a warning appears.

## Testing

The acceptance test drives the real app in headless Chromium. It covers logging Day 1, completion checkboxes, persistence across a refresh, finishing a workout, calorie maths, weekly and monthly totals with no double counting, PB history, variant tracking, export/clear/import, the library, template edits, images, mobile and desktop layouts, theme, and console errors.

```sh
python3 -m http.server 8765 &
node gym/tests/e2e.js          # needs the `playwright` package and Chromium
```
