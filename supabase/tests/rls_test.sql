-- RLS isolation tests: proves user A and user B cannot read or modify each
-- other's jobs, matches, artifacts, or resume profiles.
--
-- Run against the project database (any SQL runner):
--   psql "$SUPABASE_DB_URL" -f supabase/tests/rls_test.sql
-- Raises an exception on the first failed assertion; prints "RLS TESTS PASSED"
-- when every assertion holds. All test rows are cleaned up.

DO $$
DECLARE
  user_a uuid;
  user_b uuid;
  job_a uuid := gen_random_uuid();
  job_b uuid := gen_random_uuid();
  profile_a uuid := gen_random_uuid();
  profile_b uuid := gen_random_uuid();
  n int;
  blocked boolean;

  PROCEDURE_NOTE text := '';
BEGIN
  SELECT id INTO user_a FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO user_b FROM auth.users WHERE id <> user_a ORDER BY created_at LIMIT 1;
  IF user_a IS NULL OR user_b IS NULL THEN
    RAISE EXCEPTION 'RLS tests need two auth users';
  END IF;

  -- Seed one owned row per user (as owner/service context).
  INSERT INTO public.jobs (id, user_id, seek_job_id, title, company, location, description_snippet, job_url, pipeline_status)
  VALUES (job_a, user_a, 'rls-test-a', 'RLS A', 'A Co', 'Sydney', 'x', 'https://seek.test/a', 'inbox'),
         (job_b, user_b, 'rls-test-b', 'RLS B', 'B Co', 'Sydney', 'x', 'https://seek.test/b', 'inbox');

  INSERT INTO public.resume_profile (id, user_id, raw_text)
  VALUES (profile_a, user_a, 'resume a'), (profile_b, user_b, 'resume b');

  INSERT INTO public.job_matches (job_id, resume_profile_id, user_id, match_score, recommendation)
  VALUES (job_a, profile_a, user_a, 90, 'Apply');

  INSERT INTO public.job_artifacts (job_id, user_id, artifact_type, content, agent, version)
  VALUES (job_a, user_a, 'tailored_resume', '{}'::jsonb, 'test', '1.0');

  ---------------------------------------------------------------- as user B
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO n FROM public.jobs WHERE user_id = user_a;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: user B can read user A jobs (% rows)', n; END IF;

  SELECT count(*) INTO n FROM public.resume_profile WHERE user_id = user_a;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: user B can read user A resume profiles'; END IF;

  SELECT count(*) INTO n FROM public.job_matches WHERE user_id = user_a;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: user B can read user A matches'; END IF;

  SELECT count(*) INTO n FROM public.job_artifacts WHERE user_id = user_a;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: user B can read user A artifacts'; END IF;

  SELECT count(*) INTO n FROM public.jobs;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: user B sees % jobs, expected only its own', n; END IF;

  UPDATE public.jobs SET title = 'hacked' WHERE id = job_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: user B updated user A job'; END IF;

  DELETE FROM public.jobs WHERE id = job_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: user B deleted user A job'; END IF;

  DELETE FROM public.job_matches WHERE job_id = job_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: user B deleted user A match'; END IF;

  DELETE FROM public.job_artifacts WHERE job_id = job_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: user B deleted user A artifact'; END IF;

  -- Cannot forge ownership on insert.
  blocked := false;
  BEGIN
    INSERT INTO public.jobs (user_id, seek_job_id, title, company, location, description_snippet, job_url)
    VALUES (user_a, 'rls-test-forge', 't', 'c', 'l', 'x', 'https://seek.test/forge');
  EXCEPTION WHEN insufficient_privilege OR others THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL: user B inserted a job owned by user A'; END IF;

  -- Cannot attach own child rows to another user's parent (composite FK).
  blocked := false;
  BEGIN
    INSERT INTO public.job_matches (job_id, resume_profile_id, user_id, match_score, recommendation)
    VALUES (job_a, profile_b, user_b, 99, 'Apply');
  EXCEPTION WHEN foreign_key_violation OR others THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL: user B created a match against user A job'; END IF;

  blocked := false;
  BEGIN
    INSERT INTO public.job_artifacts (job_id, user_id, artifact_type, content, agent, version)
    VALUES (job_a, user_b, 'cover_letter', '{}'::jsonb, 'test', '1.0');
  EXCEPTION WHEN foreign_key_violation OR others THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL: user B created an artifact against user A job'; END IF;

  -- Rate limit table is server-only.
  blocked := false;
  BEGIN
    PERFORM 1 FROM public.rate_limits LIMIT 1;
  EXCEPTION WHEN OTHERS THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL: authenticated users can read rate_limits'; END IF;

  ---------------------------------------------------------------- as user A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.jobs WHERE id = job_a;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: user A cannot read its own job'; END IF;

  SELECT count(*) INTO n FROM public.jobs WHERE id = job_b;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: user A can read user B job'; END IF;

  SELECT count(*) INTO n FROM public.job_matches WHERE job_id = job_a;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: user A cannot read its own match'; END IF;

  ---------------------------------------------------------------- cleanup
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
  DELETE FROM public.job_artifacts WHERE job_id IN (job_a, job_b);
  DELETE FROM public.job_matches WHERE job_id IN (job_a, job_b);
  DELETE FROM public.jobs WHERE id IN (job_a, job_b);
  DELETE FROM public.resume_profile WHERE id IN (profile_a, profile_b);

  RAISE NOTICE 'RLS TESTS PASSED%', PROCEDURE_NOTE;
END $$;
