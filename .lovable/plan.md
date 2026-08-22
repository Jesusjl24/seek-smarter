# Seek Smarter — Phase 1 (revised)

Scope: candidate preferences, a configurable score policy, and preference-aware scoring. No Telegram, no Hermes connectivity, no unattended submission, no rebuild. Scoring never moves a job through the pipeline — it only recommends.

## Architecture recap

React 18 + Vite + TS + shadcn/Tailwind, React Router. Routes: `/landing`, `/guest`, `/auth`, and a guarded shell (`RequireAuth` → `MainLayout`) with `/` Inbox, `/shortlist`, `/not-a-fit`, `/ai-lab`. Backend is Lovable Cloud: tables `jobs`, `resume_profile`, `job_matches`, `job_artifacts` (all currently "authenticated can do anything" RLS, no anon grants); edge functions `scrape-seek`, `parse-resume`, `score-job`, `tailor-resume`, `generate-cover-letter`, `proxy-storage`, all with `verify_jwt = false`. Guest mode lives in `src/lib/guest.ts` with `isGuest()` guards in `src/lib/api/*` and in the pages that invoke functions directly (`Inbox`, `Shortlist`).

Today the scorer sees only the resume, and thresholds are hardcoded in two places (`score-job` at 80/60, Inbox auto-routing at `<50`).

## 1. Score classifier

One module, `src/lib/policy.ts`, mirrored by a copy inside `supabase/functions/_shared/policy.ts` so client and server agree:

```text
score >= policy_strong (default 80)  -> "strong_apply"  Strong Apply
score >= policy_review (default 75)  -> "review"        Review
otherwise                            -> "deprioritise"  Deprioritise
```

Validation, enforced in the form (zod), in `savePreferences`, in a DB CHECK, and again in the edge function: `0 <= policy_review < policy_strong <= 100`. Invalid input is rejected with a field error; the edge function falls back to 80/75 if the payload is missing or invalid.

No component computes its own bands. `JobCard`, `JobsTable`, `JobDetailModal`, `MatchScoreBadge`, and `AILab` all call `classifyScore`.

## 2. No automatic pipeline mutation

The `<50 → not_fit` auto-route in `src/pages/Inbox.tsx` is deleted outright. After scoring, the job stays in `inbox`; the card shows the recommendation label, reasons, dealbreaker hits, concerns, and evidence gaps, plus explicit **Shortlist** / **Not a Fit** buttons the user presses. Nothing in the scoring path calls `updateJobStatus` or `bulkUpdateJobStatus`. A test asserts this.

## 3. Authentication

Add JWT verification to `score-job`, `parse-resume`, `tailor-resume`, `generate-cover-letter` in this phase.

- New `supabase/functions/_shared/auth.ts`: reads the `Authorization: Bearer` header, verifies the token with a service-role Supabase client (`auth.getUser(token)`), returns the user or a 401 JSON response. The resolved `user.id` is the only accepted identity — no `user_id` is read from the request body, ever.
- Each of the four functions calls it first and loads `candidate_preferences` server-side by that `user.id` rather than trusting client-sent preferences for ownership (the client may still send a policy override, which is validated).
- `supabase/config.toml`: set `verify_jwt = true` for those four. `scrape-seek` and `proxy-storage` stay as they are this phase (noted in `SECURITY_TODO.md`).
- `supabase.functions.invoke` already attaches the session JWT, so client callers need no change beyond guest guards.

## 4. Ownership of preferences

`candidate_preferences` is owned per user from the start: `user_id uuid primary key references auth.users(id) on delete cascade`, with `auth.uid()`-scoped RLS. No single-owner fallback needed.

The other four tables stay authenticated-wide this phase — that is an accepted, documented limitation (see Limitations).

## 5. Preference → scoring → document data flow

```text
Settings form ──> savePreferences() ──> candidate_preferences (user-scoped)
                                             │
Inbox "Score"  ─ invoke score-job (JWT) ─────┤ function loads prefs by auth uid
                                             ├─> deterministic dealbreaker check
                                             └─> AI rubric call ─> job_matches
                                                   (+ dealbreaker_hits, concerns,
                                                      evidence_gaps, policy label)

Shortlist "Tailor" / "Cover letter" ─ invoke (JWT) ─> same server-side prefs load
                                                   ─> artifact ─> job_artifacts
```

Callers updated so preferences genuinely reach generation: `src/lib/api/jobs.ts` (`generateTailoredResume`, `generateCoverLetter`), `src/pages/Shortlist.tsx`, `src/pages/Inbox.tsx`, and the four edge functions.

## 6. Deterministic dealbreakers vs. model reasoning

A pure function `src/lib/dealbreakers.ts` (mirrored in `supabase/functions/_shared/dealbreakers.ts`) runs **before** the model and checks only structured fields plus tightly-scoped regex over the description:

- salary floor vs. `salary_range`
- location vs. allowed locations
- work arrangement (remote/hybrid/onsite)
- employment type (full-time/contract/casual)
- excluded roles/titles keyword list
- explicit mandatory qualifications the user marks as required

Output split:
- `dealbreaker_hits` — deterministic only, never model-authored.
- `concerns` — model-authored soft worries.
- `evidence_gaps` — model-authored missing evidence.

A hit caps the final score at the deprioritise band and is surfaced with the reason. Job descriptions are inserted into the prompt inside a clearly delimited untrusted-data block with an instruction that content there is data, never instructions; the model's output is parsed as JSON and every field is normalised/whitelisted before use.

## 7. Guest mode

`src/lib/guest.ts` gains seeded preferences and a local `guestSavePreferences` / `guestFetchPreferences`. `guestScoreJob` runs the same shared `classifyScore` + `evaluateDealbreakers` locally. `src/lib/api/preferences.ts` guards every call with `isGuest()`. No Supabase, AI, or edge-function call is reachable from guest mode; a test asserts the Supabase client is untouched while guest mode is on.

## 8. Package manager

Bun is authoritative. `package-lock.json` is deleted; `bun.lockb` is the committed lockfile, and the choice is documented in `README.md`. A `"typecheck": "tsc --noEmit"` script is added to `package.json`.

## 9. Tests (vitest)

- `src/lib/__tests__/policy.test.ts` — default bands at 100/80/79/75/74/0; custom thresholds; validation rejects `review >= strong` and out-of-range values.
- `src/lib/__tests__/dealbreakers.test.ts` — each rule fires and does not false-positive; a hit caps the score to deprioritise.
- `src/lib/__tests__/guest-isolation.test.ts` — with guest mode on, preferences/score/tailor/cover-letter paths make zero calls on a mocked Supabase client.
- `src/lib/__tests__/preferences.test.ts` — save/load round-trip (mocked client) and guest round-trip.
- `src/lib/__tests__/match-persistence.test.ts` — `saveJobMatch` writes `dealbreaker_hits`, `concerns`, `evidence_gaps`.
- `src/pages/__tests__/inbox-no-auto-route.test.tsx` — scoring a low-scoring job leaves `pipeline_status` as `inbox` and calls no status mutation.

## Files

New: `src/types/preferences.ts`, `src/lib/policy.ts`, `src/lib/dealbreakers.ts`, `src/lib/api/preferences.ts`, `src/pages/Settings.tsx`, `src/components/preferences/PreferencesForm.tsx`, `src/components/jobs/PolicyBadge.tsx`, `supabase/functions/_shared/auth.ts`, `supabase/functions/_shared/policy.ts`, `supabase/functions/_shared/dealbreakers.ts`, plus the six test files.

Edited: `src/App.tsx` (`/settings` route), `src/components/layout/AppSidebar.tsx` (nav item), `src/lib/guest.ts`, `src/lib/api/jobs.ts`, `src/pages/Inbox.tsx`, `src/pages/Shortlist.tsx`, `src/pages/AILab.tsx`, `src/components/jobs/JobCard.tsx`, `src/components/jobs/JobsTable.tsx`, `src/components/jobs/JobDetailModal.tsx`, `src/components/jobs/MatchScoreBadge.tsx`, `src/types/job.ts`, `supabase/functions/score-job/index.ts`, `supabase/functions/parse-resume/index.ts`, `supabase/functions/tailor-resume/index.ts`, `supabase/functions/generate-cover-letter/index.ts`, `supabase/config.toml`, `package.json`, `README.md`, `SECURITY_TODO.md`, `session.md`. Removed: `package-lock.json`.

Untouched: scraping logic, auth pages, storage/proxy, landing, resume parsing prompts.

## Migration outline

Single migration, statements in this order:

1. `CREATE TABLE public.candidate_preferences` — `user_id uuid primary key references auth.users(id) on delete cascade`, `job_goals text`, `career_direction text`, `target_titles text[]`, `target_industries text[]`, `excluded_titles text[]`, `salary_min int`, `salary_target int`, `currency text default 'AUD'`, `locations text[]`, `work_arrangements text[]`, `work_types text[]`, `mandatory_qualifications text[]`, `dealbreakers text[]`, `verified_experience text`, `policy_strong int not null default 80`, `policy_review int not null default 75`, `created_at`, `updated_at`, plus `CHECK (policy_review >= 0 AND policy_review < policy_strong AND policy_strong <= 100)`.
2. `GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_preferences TO authenticated; GRANT ALL ON public.candidate_preferences TO service_role;` (no anon).
3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
4. Four policies scoped to `auth.uid() = user_id` (select/insert/update/delete).
5. `updated_at` trigger using a `security definer` function with `SET search_path = public`.
6. `ALTER TABLE public.job_matches ADD COLUMN dealbreaker_hits text[] DEFAULT '{}', ADD COLUMN concerns text[] DEFAULT '{}'` (`evidence_gaps` reuses the existing `gaps` column, renamed in the type layer only).

No destructive changes, no backfill.

## Limitations and assumptions needing approval

- `jobs`, `job_matches`, `job_artifacts`, `resume_profile` keep authenticated-wide RLS this phase; only preferences are user-scoped. Any second account would see the pipeline. Tracked in `SECURITY_TODO.md`.
- `scrape-seek` stays `verify_jwt = false` (unauthenticated scrape trigger); `proxy-storage` stays public because the `resumes` bucket is still public.
- Deleting `package-lock.json` is assumed acceptable; say so if you'd rather keep npm.
- Deterministic salary parsing works on free-text SEEK ranges and will skip rows it cannot parse rather than guess — no hit is raised on unparseable salary.

## Verification

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
bun run test
```

Manual: `/landing` → Try guest demo → set a career profile in `/settings` (local only) → score a job and confirm the badge label follows the configured thresholds and the job stays in Inbox → add a dealbreaker a sample job violates and confirm it appears under Dealbreakers with a deprioritise label → Shortlist / Not a Fit / AI Lab still load → 375px width has no horizontal scroll. Signed-in: save preferences, score a real job, confirm `candidate_preferences` holds one row for your user and `job_matches.dealbreaker_hits` is populated; call `score-job` without a JWT and confirm 401.
