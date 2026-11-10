# Security TODOs

The self-hosted API already scopes normal data access by authenticated user and keeps uploads in owner directories. Before exposing an installation publicly:

- [ ] Put the server behind HTTPS, set `COOKIE_SECURE=true`, and restrict `CORS_ORIGIN`.
- [ ] Set a strong injected `JWT_SECRET`, disable signup after creating intended accounts, and protect the `data/` directory with host-level permissions and backups.
- [ ] Add login, scraping, pipeline, and AI-generation rate limits plus an operator-configured spend quota.
- [ ] Add password reset/account recovery and decide whether deployments require verified email.
- [ ] Rotate `AGENT_API_TOKEN` when exposed and set `AGENT_USER_ID` explicitly on multi-user installations.
- [ ] Add content-security headers and review reverse-proxy request/body-size limits.
- [ ] Keep generated drafts pending until truth review and explicit approval; never add automatic application submission without a separate, audited consent flow.
