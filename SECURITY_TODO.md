# Security TODOs — post-demo hardening

This app is currently a friend-testable MVP. Before real users touch it:

## P0 — data isolation
- [ ] Add `user_id uuid references auth.users(id)` to `jobs`, `job_matches`,
      `job_artifacts`, `resume_profile`. Backfill and set `NOT NULL`.
- [ ] Replace the "authenticated can do anything" RLS policies with
      `auth.uid() = user_id` scoping on every table.
- [ ] Move the `resumes` storage bucket to private, per-user paths
      (`<uid>/resume.pdf`) and enforce with storage RLS policies.

## P0 — edge functions
- [ ] Flip `verify_jwt = true` in `supabase/config.toml` for
      `score-job`, `tailor-resume`, `generate-cover-letter`.
      `proxy-storage` stays public until the bucket is scoped;
      `scrape-seek` can stay public if rate-limited.
- [ ] Inside each authenticated function, resolve the user from the
      JWT and only touch that user's rows.

## P1 — auth surface
- [ ] Decide on email confirm-on-signup vs. auto-confirm (currently
      requires confirmation). Document expectation in Auth page copy.
- [ ] Add a `/reset-password` route and wire
      `resetPasswordForEmail`.

## P1 — abuse
- [ ] Rate-limit `scrape-seek` per user and per IP.
- [ ] Cap AI Gateway spend per user with a daily quota.

## Guest mode
- Guest mode uses only local in-memory sample data. It calls no
  edge functions and writes to no Supabase tables. Keep it that
  way — do not route real requests through the guest path.
