# Seek Smarter → Hermes-ready workspace (Phase 1)

Phase 1 ships **candidate preferences + configurable score policy**, wired into scoring, Inbox routing, and guest mode. No Telegram, no user_id scoping, no unattended submission. The work is additive and sets up the Hermes reasoning layer for later phases.

## 1. Current architecture

**Stack** — React 18 + Vite 5 + TypeScript + Tailwind/shadcn, React Router, TanStack Query available. Backend is Lovable Cloud (Supabase). Both `bun.lockb` and `package-lock.json` exist; npm scripts are `dev / build / lint / preview / test` (vitest, one example test).

**Routes** — `/landing` (public marketing), `/guest` (enables guest mode, redirects in), `/auth` (email+password, Google, "Continue as Guest Demo"), and a guarded shell (`RequireAuth` → `MainLayout`) with `/` Inbox, `/shortlist`, `/not-a-fit`, `/ai-lab`. `RequireAuth` short-circuits to allow guest mode.

**Data flow** — `scrape-seek` (Firecrawl, markdown + per-job enrichment) → `jobs` rows → `score-job` (Lovable AI Gateway, Gemini, fixed 5-category rubric 35/30/20/10/5, thresholds hardcoded at 80/60) → `job_matches` → pipeline moves (`pipeline_status`) → `tailor-resume` / `generate-cover-letter` → `job_artifacts`. `parse-resume` fills `resume_profile`; the file lives in the `resumes` bucket and is read through `proxy-storage`.

**Guest mode** — `src/lib/guest.ts` holds seeded jobs/profile/artifacts and deterministic local scoring; `src/lib/api/*` and the pages guard every live call with `isGuest()`.

**Tables** — `jobs`, `resume_profile`, `job_matches`, `job_artifacts`. RLS is "authenticated can do anything" on all four; anon has no grants. No `user_id` columns (deliberate, single-user). Edge functions run `verify_jwt = false`.

**Gap this phase closes** — the scorer only sees the resume. It has no view of goals, salary target, location, work arrangement, or dealbreakers, and its Apply/Review/Deprioritise thresholds are baked into code in two places (edge function + Inbox auto-routing at <50).

## 2. File-by-file change plan

New:
- `src/types/preferences.ts` — `CandidatePreferences` and `ScorePolicy` types.
- `src/lib/api/preferences.ts` — fetch/save preferences with a guest guard, plus policy defaults.
- `src/pages/Settings.tsx` — "Career Profile" page: goals, target titles, salary floor/target, locations, work arrangement, work types, dealbreakers (chip list), verified-experience notes, and the three policy thresholds.
- `src/components/preferences/PreferencesForm.tsx` — form sections (react-hook-form + zod, shadcn fields).
- `src/components/jobs/PolicyBadge.tsx` — Strong Apply / Review / Deprioritise badge derived from policy, not hardcoded numbers.
- `src/lib/policy.ts` — single shared `classifyScore(score, policy)` used by cards, tables, Inbox routing, and AI Lab.

Edited:
- `src/App.tsx` — add `/settings` inside the guarded shell.
- `src/components/layout/AppSidebar.tsx` — add "Career Profile" nav item.
- `src/lib/guest.ts` — seed sample preferences; `guestScoreJob` respects dealbreakers and policy thresholds.
- `src/lib/api/jobs.ts` — pass `preferences` and `policy` into the `score-job` invoke payload; persist the returned dealbreaker hits.
- `src/pages/Inbox.tsx` — send preferences with each score call; replace the hardcoded `<50` auto-route with `classifyScore(...) === 'deprioritise'`; empty-state prompt to set up the career profile when none exists.
- `src/components/jobs/JobCard.tsx`, `src/components/jobs/JobsTable.tsx` — use `PolicyBadge`, show dealbreaker flags.
- `src/pages/AILab.tsx` — bucket the distribution by the configured thresholds instead of fixed bands.
- `supabase/functions/score-job/index.ts` — accept optional `preferences` and `policy`; extend the prompt with goals / salary / location / arrangement / verified experience; add a hard dealbreaker check that caps the score and populates `veto_reasons`; derive the recommendation label from the supplied policy (falling back to 80/75).
- `supabase/functions/tailor-resume/index.ts`, `generate-cover-letter/index.ts` — accept preferences for tone/goal alignment; keep the existing truthfulness rules and the score gate.
- `session.md`, `SECURITY_TODO.md` — record the new table and the Telegram prerequisites.

Not touched: scraping logic, auth, storage/proxy, landing, resume parsing.

## 3. Database migration plan

One migration creating a single-row-style preferences table:

```text
candidate_preferences
  id, job_goals text, career_direction text,
  target_titles text[], target_industries text[],
  salary_min int, salary_target int, currency text default 'AUD',
  locations text[], work_arrangements text[], work_types text[],
  dealbreakers text[], verified_experience text,
  policy_strong int default 80, policy_review int default 75,
  notes text, created_at, updated_at
```

Order per the house rules: `CREATE TABLE` → `GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_preferences TO authenticated; GRANT ALL TO service_role;` (no anon grant) → `ENABLE ROW LEVEL SECURITY` → an `authenticated`-only ALL policy matching the existing tables. Reuse the hardened `update_jobs_updated_at`-style trigger with `search_path = public`. Also add `job_matches.dealbreaker_hits text[] default '{}'` so vetoes are auditable. No destructive changes, no backfill needed.

## 4. Security risks and prerequisites

- **No per-user isolation.** RLS is authenticated-wide, so any signed-in account sees all jobs, resumes, and now the career profile — which is more sensitive (salary target, dealbreakers). Acceptable only while this stays your single account. Keep sign-ups closed or the account list to one.
- **`verify_jwt = false`** on `score-job`, `tailor-resume`, `generate-cover-letter`: anyone with the URL can burn AI credits. Preferences will now be sent in the request body, so add an in-code JWT check to these three as a fast follow (tracked in `SECURITY_TODO.md`).
- **Telegram prerequisites (later phase):** bot token stored as a secret, chat ID pinned to your single chat, webhook secret-token verification, and an explicit approve-before-generate step. Telegram must never trigger submissions.
- **Unattended submission stays out** — the agent prepares packages only; the Apply action remains a link out to SEEK.
- Guest mode keeps calling nothing: preferences are read from the local seed.

## 5. Smallest safe Phase 1

1. Migration: `candidate_preferences` + `job_matches.dealbreaker_hits`.
2. `/settings` career-profile page with save/load, guest-safe.
3. `classifyScore` policy helper + `PolicyBadge`, replacing every hardcoded threshold.
4. `score-job` consumes preferences and policy, returns dealbreaker hits and a policy-derived recommendation.
5. Inbox auto-routing and AI Lab bands read the configured policy.

Deferred: Hermes in-app chat panel, Telegram surface, application-package assembly, per-user isolation.

## 6. Verification

```bash
npm ci
npm run lint
npx tsc --noEmit
npm run build
npm test -- --run
```

Manual: `/landing` → Try guest demo → Inbox shows sample jobs → set a career profile in `/settings` (guest-local) → Score a job and confirm the badge label follows the configured thresholds → set a dealbreaker that a sample job violates and confirm it is flagged and deprioritised → Shortlist, Not a Fit, and AI Lab still load → check 375px width for horizontal scroll. Signed-in path: save preferences, score one real job, and confirm `candidate_preferences` and `job_matches.dealbreaker_hits` are written.
