-- Scheduled job-agent pipeline. Safe to re-run.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS triage_source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS search_profile_id uuid;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS auto_hidden_at timestamptz;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_triage_source_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_triage_source_check CHECK (triage_source IN ('manual','auto','agent'));
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_search_profile_id_fkey;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_search_profile_id_fkey FOREIGN KEY (search_profile_id, user_id) REFERENCES public.search_profiles(id, user_id);

ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS why_apply text;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS risks text;
ALTER TABLE public.job_matches DROP CONSTRAINT IF EXISTS job_matches_grade_check;
ALTER TABLE public.job_matches ADD CONSTRAINT job_matches_grade_check CHECK (grade IN ('A','B','C','D'));
CREATE INDEX IF NOT EXISTS job_matches_user_scored_idx ON public.job_matches(user_id, scored_at DESC);

ALTER TABLE public.search_profiles ADD COLUMN IF NOT EXISTS last_run_at timestamptz;
ALTER TABLE public.search_profiles ADD COLUMN IF NOT EXISTS last_run_status text;
ALTER TABLE public.search_profiles ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.search_profiles ADD COLUMN IF NOT EXISTS run_interval_minutes integer NOT NULL DEFAULT 360;
ALTER TABLE public.search_profiles DROP CONSTRAINT IF EXISTS search_profiles_run_interval_check;
ALTER TABLE public.search_profiles ADD CONSTRAINT search_profiles_run_interval_check CHECK (run_interval_minutes >= 15);

CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  search_profile_id uuid REFERENCES public.search_profiles(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  jobs_found integer NOT NULL DEFAULT 0,
  jobs_scored integer NOT NULL DEFAULT 0,
  jobs_hidden integer NOT NULL DEFAULT 0,
  jobs_strong integer NOT NULL DEFAULT 0,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pipeline_runs_select_own ON public.pipeline_runs;
DROP POLICY IF EXISTS pipeline_runs_insert_own ON public.pipeline_runs;
DROP POLICY IF EXISTS pipeline_runs_update_own ON public.pipeline_runs;
DROP POLICY IF EXISTS pipeline_runs_delete_own ON public.pipeline_runs;
CREATE POLICY pipeline_runs_select_own ON public.pipeline_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY pipeline_runs_insert_own ON public.pipeline_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY pipeline_runs_update_own ON public.pipeline_runs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY pipeline_runs_delete_own ON public.pipeline_runs FOR DELETE TO authenticated USING (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_runs TO authenticated;
GRANT ALL ON public.pipeline_runs TO service_role;
REVOKE ALL ON public.pipeline_runs FROM anon;
CREATE INDEX IF NOT EXISTS pipeline_runs_user_started_idx ON public.pipeline_runs(user_id, started_at DESC);

-- Hosted projects may not expose pg_cron/pg_net. Attempting extension enablement
-- is harmless; schedule an external hourly POST with x-cron-secret when absent.
DO $extensions$
BEGIN
  BEGIN CREATE EXTENSION IF NOT EXISTS pg_net; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_net unavailable'; END;
  BEGIN CREATE EXTENSION IF NOT EXISTS pg_cron; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron unavailable'; END;
END $extensions$;

COMMENT ON TABLE public.pipeline_runs IS 'Per-profile job-agent executions. Set CRON_SECRET and schedule POST /functions/v1/run-job-pipeline hourly; an external scheduler is supported when pg_cron/pg_net are unavailable.';
