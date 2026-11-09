# Job agent

## Architecture

Active `search_profiles` are processed by `run-job-pipeline`. Each owner-scoped run is recorded in `pipeline_runs`; SEEK links are discovered through Firecrawl and deduplicated by `(user_id, seek_job_id)`. New/unscored jobs are evaluated with the saved resume and `candidate_preferences` through the Lovable AI gateway (`google/gemini-3-flash-preview`). The server assigns an A–D grade and `why_apply` text.

Jobs below the user's review threshold are moved to `not_fit` with `triage_source=auto` and an `auto_hidden_at` timestamp. A-grade matches enqueue pending `tailor_resume` and `cover_letter` assistant tasks. These are drafts only: the existing document flow keeps `approval_status=pending`, and the pipeline never applies or submits.

The Today page shows graded inbox/shortlist jobs and can manually run the signed-in user's active profiles. Settings provides minimal saved-search creation and activation controls. Telegram remains disconnected.

## Lovable deployment steps

GitHub sync does **not** apply database migrations or redeploy Edge Functions. In Lovable chat / SQL editor:

1. Apply `supabase/migrations/20261110013000_job_agent_pipeline.sql`.
2. Deploy `run-job-pipeline`, `score-job`, and `agent-api`.
3. Set `CRON_SECRET`; confirm `FIRECRAWL_API_KEY` and `LOVABLE_API_KEY` already exist.
4. Schedule an hourly `POST /functions/v1/run-job-pipeline` with `x-cron-secret: <CRON_SECRET>`. If `pg_cron` or `pg_net` is unavailable, use an external scheduler. Do not put this secret in browser code.

`scrape-seek` does not need redeployment for this implementation because the pipeline uses its own small Firecrawl discovery call.

## Grok Bot matches poll

Credential issuance requires service-role access. Run this in the Lovable SQL editor, replacing placeholders (never commit the secret):

```sql
insert into public.agent_credentials
  (agent_id, key_id, secret_hash, owner_user_id, scopes, expires_at)
values
  ('grok-bot', 'grok-key-1', encode(digest('<RANDOM_SECRET>', 'sha256'), 'hex'),
   '<AUTH_USER_UUID>', array['matches:read'], now() + interval '90 days');
```

The signing key used by the bot is `sha256(RANDOM_SECRET)` in lowercase hex. For every request, compute:

```text
body_hash = sha256("")
canonical = "GET\n/functions/v1/agent-api/v1/matches\n<TIMESTAMP>\n<NONCE>\n<BODY_HASH>"
signature = hmac_sha256_hex(sha256_hex(RANDOM_SECRET), canonical)
```

The query string is not part of the signed path. Required headers are `x-agent-id`, `x-agent-key-id`, `x-agent-timestamp` (Unix seconds), `x-agent-nonce`, `x-agent-signature`, `x-body-sha256`, and `x-request-id`. GET requests do not need `x-idempotency-key`.

```bash
curl 'https://<project>.supabase.co/functions/v1/agent-api/v1/matches?since=2026-11-10T00:00:00Z&min_grade=B' \
  -H 'x-agent-id: grok-bot' \
  -H 'x-agent-key-id: grok-key-1' \
  -H 'x-agent-timestamp: <unix-seconds>' \
  -H 'x-agent-nonce: <unique-random-value>' \
  -H 'x-agent-signature: <hmac-hex>' \
  -H 'x-body-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' \
  -H 'x-request-id: <uuid>'
```

The response is `{ schema_version, matches, next_since }`. Poll again using `next_since`. `min_grade=A` returns A only; `min_grade=B` returns A and B. Results are owner-scoped and limited to inbox/shortlist jobs scored after `since`.

## Restore an auto-hidden job

Open **Not a Fit** and move the job back to **Inbox**. This clears `auto_hidden_at` and changes `triage_source` to `manual`, so the decision remains recoverable and visible.
