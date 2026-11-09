# Job agent

## Architecture

Active `search_profiles` are processed by `run-job-pipeline`. Each owner-scoped run is recorded in `pipeline_runs`; SEEK links are discovered through Firecrawl, then up to eight incomplete listings per profile run are enriched from their detail pages before scoring. Real JD text is retained for scoring and drafting, and jobs are deduplicated by `(user_id, seek_job_id)`.

Jobs below the user's review threshold are moved to `not_fit` with `triage_source=auto` and an `auto_hidden_at` timestamp. For up to three A-grade jobs per run, the pipeline creates a tailored resume and cover-letter artifact plus immutable `document_revisions` with pending truth/approval status. Successful tasks are marked `succeeded`; failed generations remain pending for retry. These are drafts only: the pipeline never approves, applies, or submits.

The Today page shows graded inbox/shortlist jobs and can manually run the signed-in user's active profiles. Settings provides minimal saved-search creation and activation controls. Telegram remains disconnected.

## Lovable deployment steps

GitHub sync does **not** redeploy Edge Functions. In Lovable:

1. Sync/push this branch to GitHub (the user does this step).
2. No new phase-2 migration was added. Apply any earlier unapplied migration, including `supabase/migrations/20261110013000_job_agent_pipeline.sql`.
3. Force-redeploy `run-job-pipeline`, `scrape-seek`, `score-job`, `tailor-resume`, `generate-cover-letter`, and `agent-api` (`generate-document` too if that flow is enabled).
4. Confirm secrets `FIRECRAWL_API_KEY`, `LOVABLE_API_KEY`, and `CRON_SECRET`.
5. Schedule an hourly `POST /functions/v1/run-job-pipeline` with `x-cron-secret: <CRON_SECRET>`. Never put the secret in browser code.
6. Create/activate a saved search and ensure a master resume is uploaded.
7. Issue an agent credential with `matches:read` using the SQL below.

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
canonical = "GET\n/agent-api/v1/matches\n<TIMESTAMP>\n<NONCE>\n<BODY_HASH>"
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

Use **Restore** in Today's **Auto-hidden low-fit** section, or open **Not a Fit** and move the job back to **Inbox**. This clears `auto_hidden_at` and changes `triage_source` to `manual`.
