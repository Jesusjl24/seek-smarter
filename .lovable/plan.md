## Review findings

I checked the running app, console logs, database policies, and client code. One blocker and a few smaller issues.

### 🔴 Blocker — app can't read any data
- Console: `permission denied for table jobs` on the Inbox page.
- Cause: last turn's security fix restricted `jobs`, `job_matches`, `job_artifacts`, and `resume_profile` to authenticated users, but the app has no login flow. Every client call goes as anonymous and is rejected.
- Impact: Inbox, Shortlist, Not a Fit, AI Lab, Resume upload, and job scraping all fail.

### 🟡 Other issues spotted
- Storage bucket `resumes` is public and its `storage.objects` policies allow anyone to list, upload, update, and delete files. Resumes contain PII.
- `resume_profile` has no `user_id` column, so even after adding auth, all users would share one profile row.
- `jobs` / `job_matches` / `job_artifacts` also have no per-user ownership column, so multi-user support would leak data across accounts.
- Edge functions (`scrape-seek`, `score-job`, `tailor-resume`, `generate-cover-letter`, `parse-resume`, `proxy-storage`) run with `verify_jwt = false` and don't validate the caller — anyone with the URL can invoke them and burn AI credits.
- No `<title>` / meta description overrides — `index.html` still uses defaults.

## Proposed plan

### Step 1 — Add authentication (unblocks the app)
- Enable email/password + Google sign-in on Lovable Cloud.
- Add `/auth` page (sign in / sign up) and an `AuthProvider` that hydrates the Supabase session.
- Wrap `MainLayout` routes in a `RequireAuth` guard that redirects unauthenticated users to `/auth`.
- Add a "Sign out" control in the sidebar.

### Step 2 — Scope data per user
- Migration: add `user_id uuid` to `jobs`, `job_matches`, `job_artifacts`, `resume_profile` (default `auth.uid()` on insert via trigger, backfill existing rows to the first signed-up user or NULL, then set NOT NULL).
- Replace the current `USING (true)` authenticated policies with `USING (auth.uid() = user_id)` on all four tables.
- Update client inserts to include `user_id: (await supabase.auth.getUser()).data.user?.id`.

### Step 3 — Lock down storage
- Make the `resumes` bucket private.
- Replace the four "anyone" policies with per-user policies keyed on `auth.uid()::text = (storage.foldername(name))[1]`, and store resumes under `<user_id>/filename.pdf`.
- Update `uploadResumeFile` to prefix the path with the user id, and `PDFViewer` to fetch through signed URLs (or keep the existing `proxy-storage` function but have it use a service-role client to fetch).

### Step 4 — Protect edge functions
- Flip `verify_jwt = true` in `supabase/config.toml` for `scrape-seek`, `score-job`, `tailor-resume`, `generate-cover-letter`, `parse-resume`.
- Add an in-code `getClaims(token)` check in each so unauthenticated callers get 401.
- Keep `proxy-storage` with `verify_jwt = true` and only serve files that belong to the caller.

### Step 5 — SEO / metadata polish
- Set real `<title>`, `<meta name="description">`, and matching OG/Twitter tags in `index.html`.

## Technical details

- `AuthProvider` uses `supabase.auth.onAuthStateChange` + `getSession` and exposes `{ session, user, loading }` via context. `RequireAuth` renders a spinner while `loading`, redirects to `/auth` when `session` is null, and renders children otherwise.
- The Google provider requires a workspace-level OAuth config; I'll wire the client code and note that the Google button will error until credentials are added (email/password works immediately).
- Backfilling `user_id` on existing rows: for a single-user setup we can assign every existing row to the first user that signs in via a one-off SQL update, then enforce NOT NULL. If you'd rather wipe existing rows, say so and I'll do that instead.
- Edge functions will read the JWT from the `Authorization` header, call `supabase.auth.getClaims(token)`, and reject on failure. Client calls via `supabase.functions.invoke` already forward the session, so no client changes needed there.

## Open questions
1. **Auth methods** — email/password only, or also Google (needs OAuth credentials in workspace settings)?
2. **Existing data** — assign every existing job/resume row to the first user who signs in, or wipe and start clean?
3. **Multi-user or single-user?** — if this is only ever for you, we can skip Step 2's `user_id` scoping and keep the simpler "any authenticated user sees everything" policy that's live now.
