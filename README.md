# Weight Log

A small weight tracker that runs on GitHub Pages and saves to Supabase, so your log stays in sync between your phone, laptop, or any other device you sign in on.

- Log a weigh-in per day with an optional note
- 7-day average, 30-day change, and distance to your goal
- Trend chart (30 days, 90 days, 1 year, all time)
- kg or lb
- Changes from another device show up live

It's plain HTML and JavaScript with no build step: `index.html`, `app.js`, and `config.js`.

## Gym Tracker

This repo also includes a separate five-day gym workout tracker in [`gym/`](gym/). It has machine and free-weight options, set logging, personal records, rest timers and calorie estimates. It runs entirely in the browser with no setup and lives at `/gym/` on the same GitHub Pages site. See [`gym/README.md`](gym/README.md).

## Setup

### 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project (the free tier is enough).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the tables, locks each person's rows to their own account, and turns on live updates.

### 2. Connect the app

1. In Supabase, open **Project Settings → API** and copy the **Project URL** and the **anon public** key.
2. Paste them into [`config.js`](config.js):

   ```js
   window.WEIGHT_LOG_CONFIG = {
     supabaseUrl: "https://abcdefghijkl.supabase.co",
     supabaseAnonKey: "eyJhbGciOi...",
   };
   ```

   The anon key is designed to be public. Row level security in the schema stops anyone from reading or changing data that isn't theirs. Never put the `service_role` key here.

3. Commit and push.

### 3. Turn on GitHub Pages

1. In the GitHub repo, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose your branch and the `/ (root)` folder, and save.
3. After a minute the site is live at `https://<your-username>.github.io/weight-track/`.

GitHub Pages on a private repo needs a paid GitHub plan. On a free plan, make the repo public. Your weight data is never in the repo, only in Supabase.

### 4. Point Supabase sign-in emails at your site

In Supabase, open **Authentication → URL Configuration** and set **Site URL** to your GitHub Pages address (for example `https://<your-username>.github.io/weight-track/`). Email confirmation links then bring you back to the app.

If you don't want to confirm by email, turn off **Confirm email** under **Authentication → Sign In / Providers → Email**.

### 5. Use it

Open the site, choose **Create account**, then sign in with the same email and password on your other device.

## Running locally

Serve the folder with any static server, for example:

```sh
python3 -m http.server 8000
```

then open <http://localhost:8000>. Add `http://localhost:8000` to **Redirect URLs** in Supabase if you want confirmation links to work locally.
