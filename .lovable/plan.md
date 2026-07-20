
# Seek Smarter — Friend-testable MVP polish

Additive, in-place changes on the existing Vite + React + TS + Supabase + shadcn app. No rebuild. Preserve routes, edge functions, auth, and the multi-agent pipeline.

## 1. Rebrand: JS-Searcher → Seek Smarter

Global find/replace of user-facing strings only (leave repo/package names alone):
- `index.html` title/description/OG tags → "Seek Smarter — Turn SEEK listings into a ranked application plan"
- `src/pages/Auth.tsx` `CardTitle`
- `src/components/layout/AppSidebar.tsx` header
- Any remaining "JS-Searcher" copy

## 2. Routing model

Keep `BrowserRouter` in `src/App.tsx`. Introduce a lightweight `GuestModeProvider` (localStorage flag `seek-smarter:guest = "1"`).

New route map:
```text
/landing           public marketing page
/auth              public auth (unchanged surface, polished)
/guest             enables guest mode, redirects to /
/                  Inbox — allowed when session OR guest
/shortlist         same guard
/not-a-fit         same guard
/ai-lab            same guard
```

Update `RequireAuth` → `RequireAccess`: allow through if `session || guestMode`. Unauthenticated + non-guest hitting `/` redirects to `/landing` (not `/auth`).

## 3. Landing page (`src/pages/Landing.tsx`)

Mobile-first, dark/light, no fake logos/metrics/testimonials. Sections:

1. **Hero** — headline "Stop guessing which jobs are worth applying to.", subhead about scoring SEEK listings against your resume. CTAs: **Try guest demo** (`/guest`), **Sign in** (`/auth`). Right-side (or below on mobile) a real, static mini "cockpit" preview built from actual `JobCard`/score-badge components showing Resume → Search → Score → Shortlist → Tailor as a horizontal stepper.
2. **Problem** — 4 short bullets (too many listings, unclear fit, tailoring is slow, spreadsheet mess).
3. **Product loop** — 5 numbered steps using real product icons: Upload resume → Search SEEK → Score fit → Shortlist/reject → Generate tailored materials.
4. **Privacy / honesty** — only the approved copy ("Designed as a private job-search workspace.", "Guest demo uses sample data.", "For production, keep resumes in authenticated private storage."). No "bank-level" claims.
5. **Demo CTA** — repeat "Try guest demo" + secondary sign-in.

Visual: Tailwind, semantic tokens (`bg-background`, `text-foreground`, `border`, `primary`). Use one subtle radial gradient behind hero, a glass card for the preview, generous spacing. Reuse shadcn `Button`, `Card`, `Badge`. No new heavy deps.

## 4. Guest mode

`src/lib/guest.ts` (new): `isGuest()`, `enableGuest()`, `exitGuest()`, plus `guestSeed` (jobs, resume profile, scores, artifacts — sample but realistic AU roles).

`src/pages/GuestEntry.tsx` (new): calls `enableGuest()` and `navigate("/", { replace: true })`.

Data layer switch: `src/lib/api/jobs.ts` and `src/lib/api/resume.ts` get a top-of-file `if (isGuest()) return guest…` branch for read/write functions used by pipeline pages. Writes in guest mode mutate an in-memory store (module-scoped `let` seeded on first read) so Score/Shortlist/Not-a-Fit actions feel real without hitting Supabase.

Edge function calls (`score-job`, `tailor-resume`, `generate-cover-letter`, `scrape-seek`) get a guard in the pages: if `isGuest()`, return a deterministic mocked response from `guestSeed` (predefined scores + short pros/cons/advice text) with a 400ms delay for realism.

UI:
- `MainLayout`: top banner "Guest demo — sample data, no live APIs." with **Exit demo** button (calls `exitGuest()` → `/landing`).
- Sidebar shows a small **Guest Demo** badge next to the brand when active.
- Auth page gains "Continue as Guest Demo" secondary button.

## 5. App shell polish

`AppSidebar.tsx`:
- Brand row: logo mark (simple SVG, no new asset generation) + "Seek Smarter" wordmark, optional guest badge.
- Nav items with icons already present; add subtle active-state pill (`bg-primary/10 text-primary`).
- Footer: user email (or "Guest") + theme toggle + sign out / exit demo.
- Ensure `collapsible="icon"` and keep `SidebarTrigger` in header for mobile.

`MainLayout.tsx`: sticky top bar with `SidebarTrigger` + page title slot + guest banner. Ensure root `w-full min-h-screen` and no horizontal overflow at 320px.

## 6. Inbox polish (`src/pages/Inbox.tsx` + `JobCard.tsx`)

- Empty state: 5-step checklist card (Upload resume / Search SEEK / Score jobs / Shortlist / Generate tailored material) with each item's completion inferred from state.
- Search bar row: keep, tighten spacing, make filter panel collapsible on mobile (`Sheet`).
- `JobCard`: 2-line title clamp, company + location + work type chips, salary if present, score badge (colored by band), recommendation label, one-line reasoning preview. Actions: Score / Shortlist / Not a Fit / Details / View on SEEK. On mobile, actions collapse into a dropdown but each option has a text label (no ambiguous icon-only).

Score explanation: `JobDetailModal` already renders pros/cons/gaps/advice — verify tabs and add "Tailor resume" / "Generate cover letter" CTAs when score ≥ 60.

## 7. Shortlist / Not a Fit responsive

`JobsTable.tsx`: render existing table at `md:` and above; below `md`, render a card list (reuse a compact variant of `JobCard` with stage selector, notes preview, artifact indicators, actions menu). Not a Fit gets "Move to Inbox / Shortlist" quick actions.

## 8. AI Lab polish

`src/pages/AILab.tsx`: cleaner stat cards (score distribution histogram using existing data, agent-version table, empty state when no scored jobs). No new chart dep — use CSS bars.

## 9. Lint fixes

- `src/components/jobs/JobsTable.tsx`: `let filtered` → `const`.
- `src/components/ui/command.tsx`, `textarea.tsx`: empty interface → `type X = ComponentProps<...>`.
- `tailwind.config.ts`: `require("tailwindcss-animate")` → ESM `import animate from "tailwindcss-animate"`.
- `supabase/functions/scrape-seek/index.ts`: remove unnecessary regex escape.
- Narrow one or two `any` to minimal shapes where trivial; do not chase every one.

## 10. Security follow-up (non-blocking)

Add `SECURITY_TODO.md` listing: enable `verify_jwt = true` on functions post-demo, add per-user `user_id` scoping columns, lock storage bucket to `resumes/<uid>/`. No config changes this pass to avoid breaking demo.

## Files touched

New: `src/pages/Landing.tsx`, `src/pages/GuestEntry.tsx`, `src/lib/guest.ts`, `SECURITY_TODO.md`.

Modified: `src/App.tsx`, `src/components/auth/RequireAuth.tsx` (→ RequireAccess), `src/pages/Auth.tsx`, `src/pages/Inbox.tsx`, `src/pages/Shortlist.tsx`, `src/pages/NotAFit.tsx`, `src/pages/AILab.tsx`, `src/components/layout/MainLayout.tsx`, `src/components/layout/AppSidebar.tsx`, `src/components/jobs/JobCard.tsx`, `src/components/jobs/JobsTable.tsx`, `src/components/jobs/JobDetailModal.tsx`, `src/lib/api/jobs.ts`, `src/lib/api/resume.ts`, `index.html`, `tailwind.config.ts`, `src/components/ui/command.tsx`, `src/components/ui/textarea.tsx`, `supabase/functions/scrape-seek/index.ts`.

## Verification

- `bun run build` and `tsgo --noEmit` must pass.
- `bunx vitest run` must pass.
- `bun run lint` — report remaining pre-existing warnings.
- Playwright smoke: `/landing` → click "Try guest demo" → `/` shows seeded jobs → Score updates card → Shortlist shows entry → AI Lab renders. Capture screenshots at 375 and 1280 px into `/tmp/browser/screenshots/`.

## Out of scope this pass

- Real per-user data isolation, JWT enforcement on edge functions, storage bucket lockdown (documented in `SECURITY_TODO.md`).
- Generated brand imagery (using typographic wordmark + subtle gradient only).
- Persisting guest actions across reloads (in-memory only, acceptable for friend demo).
