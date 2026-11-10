# Seek Smarter — project session notes

Seek Smarter is a self-hosted job-search workspace. The React/Vite frontend talks to a Hono Node API backed by SQLite and owner-scoped local uploads.

## Runtime

- `npm run dev` starts Vite and the API watcher.
- `npm run build` builds the frontend and type-checks the server.
- `npm start` serves the production build and API on port 3100 by default.
- Migrations in `server/migrations/` run automatically.
- Runtime state belongs under `data/` and must not be committed.

Configuration is documented in `.env.example`. Process environment values win over `.env`. OpenAI-compatible and Gemini providers are supported; Firecrawl is optional. `PIPELINE_CRON=off` disables scheduling.

## Safety and ownership

Every browser API query must be scoped to the authenticated `user_id`. Generated application documents remain pending until explicit user approval, and the pipeline never applies to jobs. The machine matches endpoint uses a static bearer token bound to one user; configure `AGENT_USER_ID` when an installation has multiple accounts.

Do not edit or delete the production SQLite database or generated token/secret files while developing. Add schema changes as new numbered SQLite migrations and cover ownership-sensitive routes with tests.
