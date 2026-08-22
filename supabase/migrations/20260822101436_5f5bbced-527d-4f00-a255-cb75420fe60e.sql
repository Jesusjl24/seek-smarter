-- 1. Ownership columns
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.resume_profile ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.job_artifacts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.resume_profile ADD COLUMN IF NOT EXISTS file_path text;

-- 2. Safe backfill to the earliest (owner) account; purge if no accounts exist
DO $$
DECLARE owner_id uuid;
BEGIN
  SELECT id INTO owner_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN
    DELETE FROM public.job_artifacts;
    DELETE FROM public.job_matches;
    DELETE FROM public.jobs;
    DELETE FROM public.resume_profile;
  ELSE
    UPDATE public.jobs SET user_id = owner_id WHERE user_id IS NULL;
    UPDATE public.resume_profile SET user_id = owner_id WHERE user_id IS NULL;
    UPDATE public.job_matches SET user_id = owner_id WHERE user_id IS NULL;
    UPDATE public.job_artifacts SET user_id = owner_id WHERE user_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.jobs ALTER COLUMN user_id SET NOT NULL, ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.resume_profile ALTER COLUMN user_id SET NOT NULL, ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.job_matches ALTER COLUMN user_id SET NOT NULL, ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.job_artifacts ALTER COLUMN user_id SET NOT NULL, ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 3. Cross-owner reference protection via composite foreign keys
ALTER TABLE public.jobs ADD CONSTRAINT jobs_id_user_key UNIQUE (id, user_id);
ALTER TABLE public.resume_profile ADD CONSTRAINT resume_profile_id_user_key UNIQUE (id, user_id);

ALTER TABLE public.job_matches DROP CONSTRAINT IF EXISTS job_matches_job_id_fkey;
ALTER TABLE public.job_matches DROP CONSTRAINT IF EXISTS job_matches_resume_profile_id_fkey;
ALTER TABLE public.job_matches
  ADD CONSTRAINT job_matches_job_owner_fkey FOREIGN KEY (job_id, user_id)
  REFERENCES public.jobs(id, user_id) ON DELETE CASCADE;
ALTER TABLE public.job_matches
  ADD CONSTRAINT job_matches_profile_owner_fkey FOREIGN KEY (resume_profile_id, user_id)
  REFERENCES public.resume_profile(id, user_id) ON DELETE CASCADE;

ALTER TABLE public.job_artifacts DROP CONSTRAINT IF EXISTS job_artifacts_job_id_fkey;
ALTER TABLE public.job_artifacts
  ADD CONSTRAINT job_artifacts_job_owner_fkey FOREIGN KEY (job_id, user_id)
  REFERENCES public.jobs(id, user_id) ON DELETE CASCADE;

-- SEEK ids are unique per user, not globally
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_seek_job_id_key;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_user_seek_job_key UNIQUE (user_id, seek_job_id);

CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS job_matches_user_id_idx ON public.job_matches(user_id);
CREATE INDEX IF NOT EXISTS job_artifacts_user_id_idx ON public.job_artifacts(user_id);
CREATE INDEX IF NOT EXISTS resume_profile_user_id_idx ON public.resume_profile(user_id);

-- 4. Owner-scoped RLS replacing authenticated-wide policies
DROP POLICY IF EXISTS "Authenticated users can manage jobs" ON public.jobs;
DROP POLICY IF EXISTS "Authenticated users can manage job_matches" ON public.job_matches;
DROP POLICY IF EXISTS "Authenticated users can manage job_artifacts" ON public.job_artifacts;
DROP POLICY IF EXISTS "Authenticated users can manage resume_profile" ON public.resume_profile;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_select_own" ON public.jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "jobs_insert_own" ON public.jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "jobs_update_own" ON public.jobs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "jobs_delete_own" ON public.jobs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "job_matches_select_own" ON public.job_matches FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "job_matches_insert_own" ON public.job_matches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "job_matches_update_own" ON public.job_matches FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "job_matches_delete_own" ON public.job_matches FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "job_artifacts_select_own" ON public.job_artifacts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "job_artifacts_insert_own" ON public.job_artifacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "job_artifacts_update_own" ON public.job_artifacts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "job_artifacts_delete_own" ON public.job_artifacts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "resume_profile_select_own" ON public.resume_profile FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "resume_profile_insert_own" ON public.resume_profile FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "resume_profile_update_own" ON public.resume_profile FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "resume_profile_delete_own" ON public.resume_profile FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_artifacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_profile TO authenticated;
GRANT ALL ON public.jobs, public.job_matches, public.job_artifacts, public.resume_profile TO service_role;
REVOKE ALL ON public.jobs, public.job_matches, public.job_artifacts, public.resume_profile FROM anon;

-- 5. Per-user rate limiting (server-side only)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint, window_start)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.rate_limits TO service_role;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

-- 6. Owner-scoped resume storage policies (<user_id>/<revision>/<file>)
DROP POLICY IF EXISTS "Public read resumes" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload resumes" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update resumes" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete resumes" ON storage.objects;
DROP POLICY IF EXISTS "resumes_select_own" ON storage.objects;
DROP POLICY IF EXISTS "resumes_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "resumes_update_own" ON storage.objects;
DROP POLICY IF EXISTS "resumes_delete_own" ON storage.objects;

CREATE POLICY "resumes_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "resumes_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "resumes_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "resumes_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);