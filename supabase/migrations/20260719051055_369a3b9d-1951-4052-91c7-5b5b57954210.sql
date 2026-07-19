
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Allow all operations on job_artifacts" ON public.job_artifacts;
DROP POLICY IF EXISTS "Allow all operations on job_matches" ON public.job_matches;
DROP POLICY IF EXISTS "Allow all operations on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow all operations on resume_profile" ON public.resume_profile;

-- Revoke anon access
REVOKE ALL ON public.job_artifacts FROM anon;
REVOKE ALL ON public.job_matches FROM anon;
REVOKE ALL ON public.jobs FROM anon;
REVOKE ALL ON public.resume_profile FROM anon;

-- Ensure authenticated + service_role grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_artifacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_profile TO authenticated;
GRANT ALL ON public.job_artifacts TO service_role;
GRANT ALL ON public.job_matches TO service_role;
GRANT ALL ON public.jobs TO service_role;
GRANT ALL ON public.resume_profile TO service_role;

-- Authenticated-only policies for each table (single-workspace app; scope tightens further once auth adds user_id columns)
CREATE POLICY "Authenticated users can manage job_artifacts"
  ON public.job_artifacts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage job_matches"
  ON public.job_matches FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage jobs"
  ON public.jobs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage resume_profile"
  ON public.resume_profile FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Fix mutable search_path on trigger function
CREATE OR REPLACE FUNCTION public.update_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
