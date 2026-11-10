# Seek Smarter

A self-hosted React/Vite job-search workspace with a lightweight Hono API, SQLite, local authentication and local file storage.

## Self-hosting

Requirements: Node.js 22+ and npm. Native build tools are needed when `better-sqlite3` does not have a prebuilt binary for your platform.

```sh
cp .env.example .env
# Set a strong JWT_SECRET and optionally an AI provider key.
npm install
npm run dev
```

The server reads `.env` from its working directory. Values already present in `process.env` take precedence, so injected deployment secrets are never replaced by file values.

Development runs Vite at `http://localhost:8080` and the API at `http://localhost:3100`; Vite proxies `/api` and `/uploads`. Create the first account from the Sign Up tab. The first account can always be created. Later signups follow `AUTH_ALLOW_SIGNUP`, which defaults to `true`; set it to `false` after creating your owner account if desired.

For production:

```sh
npm run build
npm start
```

The production server serves `dist/` on `PORT` (3100 by default). SQLite defaults to `data/seek-smarter.db`, uploads to `data/uploads`, and migrations run automatically. Back up the whole `data/` directory. Files require authentication and paths are restricted to their owner.

### Docker

```sh
docker build -t seek-smarter .
docker run --rm -p 3100:3100 --env-file .env \
  -v "$PWD/data:/app/data" seek-smarter
```

Use `COOKIE_SECURE=true` behind HTTPS. Never put secrets into the image or repository.

### AI, scraping, and cron

The default provider is xAI Grok: set `AI_PROVIDER=xai` (the default) and `XAI_API_KEY`. The default model is `grok-4.3`, the current cheapest capable general/fast-tier model on the public xAI API after the May 15, 2026 retirement of `grok-3-mini`, `grok-4-fast`, and `grok-4-1-fast`. Official pricing from [xAI model docs](https://docs.x.ai/docs/models) and the [grok-4.3 page](https://docs.x.ai/docs/models/grok-4.3) is $1.25 / 1M input, $0.20 cached, and $2.50 / 1M output for prompts under 200k tokens (long context ≥200k is $2.50 / $0.40 / $5.00). You can override the model with `XAI_MODEL` (for example the cheaper coding model `grok-build-0.1`). Alternatively set `AI_PROVIDER=openai` with `OPENAI_API_KEY`, or `AI_PROVIDER=gemini` with `GEMINI_API_KEY`. Missing keys produce a clear 503 for interactive generation, while pipelines complete and record the skipped reason. SEEK scraping uses `FIRECRAWL_API_KEY` when present (process environment wins over `.env`) and otherwise makes a best-effort direct request, reporting likely blocking without crashing.

The scheduler uses `PIPELINE_CRON` (`0 * * * *` by default). Set it to `off` to disable it. Scheduled and manual runs share the same pipeline. The assistant never auto-applies: drafts remain pending for explicit approval.

### Agent polling

Set `AGENT_API_TOKEN`, or the server creates one in `data/agent-token.txt` with mode 0600 and logs only that path. The token binds to the sole/first account. If the installation has multiple unbound accounts, set `AGENT_USER_ID` to the account id the agent may read.

```sh
curl -H "Authorization: Bearer $AGENT_API_TOKEN" \
  "http://localhost:3100/api/agent/matches?since=2026-01-01T00:00:00Z&min_grade=B"
```

The endpoint uses the static token and returns only the bound user's inbox/shortlist matches.

## Commands

- `npm run dev` — frontend and API with reload
- `npm run build` — Vite build plus server type-check
- `npm start` — production API and static frontend
- `npm test` — frontend and server Vitest suites
- `npm run lint` — ESLint
