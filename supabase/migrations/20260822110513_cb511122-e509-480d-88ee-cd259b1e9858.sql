-- Versioned job description snapshots
CREATE TABLE public.job_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  revision_number integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  company text NOT NULL,
  location text,
  salary_range text,
  work_type text,
  work_arrangement text,
  description text NOT NULL,
  source_url text NOT NULL,
  provider text NOT NULL DEFAULT 'seek',
  provider_external_id text,
  date_posted date,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id),
  UNIQUE (user_id, job_id, revision_number),
  FOREIGN KEY (job_id, user_id) REFERENCES public.jobs(id, user_id) ON DELETE CASCADE
);

ALTER TABLE public.assistant_tasks
  ADD CONSTRAINT assistant_tasks_job_revision_fkey
  FOREIGN KEY (job_revision_id, user_id) REFERENCES public.job_revisions(id, user_id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_revisions TO authenticated;
GRANT ALL ON public.job_revisions TO service_role;
ALTER TABLE public.job_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_revisions_select_own ON public.job_revisions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY job_revisions_insert_own ON public.job_revisions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY job_revisions_update_own ON public.job_revisions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY job_revisions_delete_own ON public.job_revisions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Machine identity credentials (secret hash is server-only)
CREATE TABLE public.agent_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  key_id text NOT NULL UNIQUE,
  secret_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.agent_credentials TO service_role;
ALTER TABLE public.agent_credentials ENABLE ROW LEVEL SECURITY;
-- No authenticated grants: the secret hash never leaves the server.
CREATE POLICY agent_credentials_service_only ON public.agent_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_agent_credentials_agent ON public.agent_credentials(agent_id);

-- Replay protection
CREATE TABLE public.agent_nonces (
  key_id text NOT NULL,
  nonce text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key_id, nonce)
);
GRANT ALL ON public.agent_nonces TO service_role;
ALTER TABLE public.agent_nonces ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_nonces_service_only ON public.agent_nonces FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_agent_nonces_seen ON public.agent_nonces(seen_at);

-- Rate limit / quota counters
CREATE TABLE public.agent_usage (
  agent_id text NOT NULL,
  window_start timestamptz NOT NULL,
  day_start date NOT NULL,
  minute_count integer NOT NULL DEFAULT 0,
  day_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id)
);
GRANT ALL ON public.agent_usage TO service_role;
ALTER TABLE public.agent_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_usage_service_only ON public.agent_usage FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Idempotent request replay log
CREATE TABLE public.agent_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  owner_user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_id text,
  route text NOT NULL,
  status_code integer NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, idempotency_key)
);
GRANT ALL ON public.agent_request_log TO service_role;
ALTER TABLE public.agent_request_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_request_log_service_only ON public.agent_request_log FOR ALL TO service_role USING (true) WITH CHECK (true);
