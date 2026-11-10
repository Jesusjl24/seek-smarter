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

Set `AI_PROVIDER=openai` with `OPENAI_API_KEY`; `OPENAI_BASE_URL` can target an OpenAI-compatible service. Alternatively use `AI_PROVIDER=gemini` with `GEMINI_API_KEY`. Missing keys produce a clear 503 for interactive generation, while pipelines complete and record the skipped reason. SEEK scraping makes a best-effort direct request when `FIRECRAWL_API_KEY` is absent and reports likely blocking without crashing.

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
