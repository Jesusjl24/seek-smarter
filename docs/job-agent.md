# Job agent

## Architecture

Active `search_profiles` are processed by the Node job pipeline. Each user-scoped run is recorded in `pipeline_runs`; SEEK links are discovered directly or through Firecrawl, enriched, scored, and deduplicated by `(user_id, seek_job_id)`.

Jobs below the review threshold move to `not_fit` with `triage_source=auto` and an `auto_hidden_at` timestamp. For at most three A-grade jobs per pipeline run, the server creates tailored resume and cover-letter artifacts plus immutable `document_revisions`. Their truth and approval states remain `pending`: the pipeline never approves, applies, or submits. Missing AI keys or resume evidence and individual generation failures are recorded as skipped/task results without failing the run.

The Today page shows graded inbox/shortlist jobs and can manually run the signed-in user's active profiles. Settings provides saved-search creation and activation controls. Telegram remains disconnected.

## Self-hosting and scheduling

Copy `.env.example` to `.env`. Configure a strong `JWT_SECRET`, the default xAI provider (`XAI_API_KEY`, optional `XAI_MODEL` defaulting to `grok-4.3`), and `FIRECRAWL_API_KEY` for reliable SEEK scraping. OpenAI and Gemini remain alternatives via `AI_PROVIDER`. Existing process environment values take precedence over `.env`.

```bash
npm install
npm run build
npm start
```

`PIPELINE_CRON` controls scheduled runs and defaults to hourly (`0 * * * *`); set it to `off` to disable scheduling. Create and activate a saved search and save a resume profile before expecting scoring and drafts.

## Agent matches poll

Set `AGENT_API_TOKEN`, or read the generated token from `data/agent-token.txt`. The server stores only its hash in SQLite. With one user, the token binds automatically. For multiple users, set `AGENT_USER_ID` to the account the agent is allowed to read.

```bash
curl -H "Authorization: Bearer $AGENT_API_TOKEN" \
  'http://localhost:3100/api/agent/matches?since=2026-11-10T00:00:00Z&min_grade=B'
```

The response is `{ schema_version, matches, next_since }`. Poll again using `next_since`. `min_grade=A` returns A only; `min_grade=B` returns A and B. Results are bound-user-only and limited to inbox/shortlist jobs scored after `since`.

## Restore an auto-hidden job

Use **Restore** in Today's **Auto-hidden low-fit** section, or open **Not a Fit** and move the job back to **Inbox**. This clears `auto_hidden_at` and changes `triage_source` to `manual`.
