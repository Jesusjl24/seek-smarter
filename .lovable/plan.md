# agent-api: Hermes Job Assistant machine API

A single Edge Function (`agent-api`) that exposes seven task-scoped operations to a dedicated machine identity. No generic CRUD, no SQL passthrough, no service-role key leaving the server, no submission capability.

## Authentication model

Dedicated machine identity, HMAC-signed short-lived requests:

- Each agent gets a row in `agent_credentials`: `agent_id`, `key_id`, `secret_hash` (SHA-256 of a generated secret), `owner_user_id`, `scopes[]`, `expires_at`, `revoked_at`. Rotation = insert a new `key_id` for the same `agent_id`, then revoke the old one; both work during overlap.
- Every request carries headers:
  - `x-agent-key-id`, `x-agent-id`
  - `x-agent-timestamp` (unix seconds, must be within ±120s)
  - `x-agent-nonce` (uuid, single-use)
  - `x-request-id`, `x-idempotency-key`
  - `x-body-sha256` (hex digest of the raw body; must match)
  - `x-agent-signature` = HMAC-SHA256(secret, `METHOD\npath\ntimestamp\nnonce\nbody_sha256`)
- Server verifies: key exists → not revoked → not expired → signature matches → timestamp fresh → nonce unused (`agent_nonces`, unique on `(key_id, nonce)`, pruned after 10 min) → scope allows the route → owner binding (every row read/written must belong to `owner_user_id`).
- Scopes per route: `tasks:claim`, `context:read`, `runs:heartbeat`, `recommendations:write`, `documents:write`, `runs:complete`.
- Rate limits: per-agent sliding window (60 req/min) plus a daily quota (default 2000 req/day) tracked in `agent_usage`. Over limit → 429 with `retry_after`.

## Routes

All under `/agent-api/v1`. All bodies validated with Zod; unknown fields rejected. All writes require the envelope: `request_id`, `idempotency_key`, `agent_id`, `run_id`, `task_id`, `schema_version`, `input_snapshot_hash`, `agent_version`.

| Route | Scope | Behaviour |
|---|---|---|
| `POST /v1/tasks/claim` | `tasks:claim` | Leases up to `max_tasks` (1–5) pending tasks for the owner: sets `status='leased'`, `lease_owner=agent_id`, `lease_expires_at=now()+lease_seconds` (60–900), increments `attempt_count`. Returns leased task stubs. |
| `GET /v1/tasks/:id/context` | `context:read` | Returns the read-only context bundle (below). Requires a live lease held by this agent. |
| `POST /v1/tasks/:id/heartbeat` | `runs:heartbeat` | Extends `lease_expires_at`. Stale/lost lease → 409 `lease_lost`. |
| `POST /v1/tasks/:id/recommendation` | `recommendations:write` | Inserts one `assistant_recommendations` row (score, band, blockers, reasoning, gaps, strengths, concerns, proposed_action). Idempotent per `idempotency_key`. |
| `POST /v1/tasks/:id/document` | `documents:write` | Inserts one immutable `document_revisions` row (`resume` or `cover_letter`), auto-assigning `revision_number` and `supersedes_revision_id`. Always `approval_status='pending'` — the agent can never approve. |
| `POST /v1/tasks/:id/complete` | `runs:complete` | Marks task `succeeded`, clears lease, rolls up run counters. |
| `POST /v1/tasks/:id/fail` | `runs:complete` | Marks task `failed` (or back to `pending` when `retryable` and attempts remain), records `last_error`. Never mutates recommendations or job state. |

Errors are uniform: `{ error: { code, message, request_id } }` with codes `unauthorized`, `forbidden_scope`, `expired_credential`, `replay_detected`, `not_found`, `lease_lost`, `stale_snapshot`, `invalid_request`, `rate_limited`.

## Context payload (nothing else)

```json
{
  "task": { "id", "task_type", "attempt_count", "lease_expires_at", "input_snapshot_hash" },
  "run": { "id", "agent_version" },
  "job": { "id", "job_revision_id", "title", "company", "location", "salary_range",
           "work_type", "work_arrangement", "description", "source_url",
           "provider": { "name": "seek", "external_id", "date_posted" } },
  "resume_revision": { "id", "revision_number", "content_hash", "raw_text", "structured_profile" },
  "candidate_facts": [ { "fact_type", "fact_text", "evidence_reference" } ],
  "preferences": { "target_titles", "locations", "salary_min", "work_arrangements", "dealbreakers", ... },
  "score_policy": { "strong": 80, "review": 75 },
  "schema_version": "1.0"
}
```

Only the approved resume revision (`approved_at not null`) and only `verified = true` candidate facts are included. No credentials, no tokens, no storage keys, no Telegram/SEEK config.

## Explicitly not built

No SQL endpoint, no table proxy, no service-role exposure, no credential passthrough, no submit/apply route, no browser automation, no cron.

## Database migration

New tables (user-scoped RLS; the function reaches them with the service-role client held server-side only):

- `agent_credentials` — `agent_id`, `key_id` (unique), `secret_hash`, `owner_user_id`, `scopes[]`, `expires_at`, `revoked_at`, `last_used_at`
- `agent_nonces` — `key_id`, `nonce`, `seen_at`, unique `(key_id, nonce)`
- `agent_usage` — `agent_id`, `window_start`, `minute_count`, `day_start`, `day_count`
- `agent_request_log` — `agent_id`, `idempotency_key`, `route`, `response_json`, unique `(agent_id, idempotency_key)` → duplicate requests replay the stored response
- `assistant_tasks.job_revision_id` gains a lightweight `job_revisions` companion table so job descriptions are versioned and hashable

Owner rows stay invisible to clients: `agent_credentials.secret_hash` is never selectable by `authenticated` (grants to `service_role` only; owner gets a redacted view later if needed).

## File plan

```
supabase/functions/agent-api/index.ts        router + request pipeline
supabase/functions/agent-api/auth.ts         key lookup, HMAC verify, expiry, nonce, scope, owner binding
supabase/functions/agent-api/limits.ts       per-minute rate limit + daily quota
supabase/functions/agent-api/schemas.ts      Zod schemas for every request/response, shared envelope
supabase/functions/agent-api/handlers.ts     claim / context / heartbeat / recommendation / document / complete / fail
supabase/functions/agent-api/errors.ts       uniform error codes and responses
supabase/functions/agent-api/index.test.ts   contract tests (Deno)
src/lib/assistant/agentProtocol.ts           shared canonical-string + body-hash helpers (pure)
src/test/agent-protocol.test.ts              vitest unit tests for signing/replay/scope helpers
```

## Contract tests

Deno tests against the deployed function plus pure unit tests for the signing helpers, covering: invalid signature, unknown key id, revoked key, expired credential, stale timestamp, replayed nonce, wrong owner's task, missing scope, duplicate idempotency key (same response, no second row), heartbeat on an expired lease, write on a stale lease, stale `input_snapshot_hash`, successful claim→context→recommendation→document→complete flow, and a `fail` call leaving unrelated state untouched.

## Verification

`bunx vitest run`, `bunx tsgo --noEmit -p tsconfig.app.json`, and the Deno contract suite via the edge-function test tool.
