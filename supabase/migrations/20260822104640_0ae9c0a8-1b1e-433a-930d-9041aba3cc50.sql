-- ============ ENUM-ish via CHECK constraints for flexibility ============

-- 1. search_profiles
CREATE TABLE public.search_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_titles text[] NOT NULL DEFAULT '{}',
  adjacent_titles text[] NOT NULL DEFAULT '{}',
  locations text[] NOT NULL DEFAULT '{}',
  salary_min integer,
  employment_types text[] NOT NULL DEFAULT '{}',
  work_arrangements text[] NOT NULL DEFAULT '{}',
  industries text[] NOT NULL DEFAULT '{}',
  excluded_companies text[] NOT NULL DEFAULT '{}',
  dealbreakers text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

-- 2. resume_revisions (immutable)
CREATE TABLE public.resume_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  raw_text text NOT NULL,
  structured_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_document_id uuid REFERENCES public.resume_profile(id) ON DELETE SET NULL,
  parser_version text NOT NULL DEFAULT '1.0',
  content_hash text NOT NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, revision_number),
  UNIQUE (user_id, content_hash),
  UNIQUE (user_id, id)
);

-- 3. candidate_facts
CREATE TABLE public.candidate_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_revision_id uuid NOT NULL,
  fact_type text NOT NULL,
  fact_text text NOT NULL,
  evidence_reference text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (resume_revision_id, user_id) REFERENCES public.resume_revisions(id, user_id) ON DELETE CASCADE
);

-- 4. assistant_runs
CREATE TABLE public.assistant_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  jobs_found integer NOT NULL DEFAULT 0,
  jobs_assessed integer NOT NULL DEFAULT 0,
  recommendations_count integer NOT NULL DEFAULT 0,
  questions_count integer NOT NULL DEFAULT 0,
  failure_message text,
  model text,
  agent_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

-- 5. assistant_tasks
CREATE TABLE public.assistant_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid,
  task_type text NOT NULL CHECK (task_type IN ('discover','assess','tailor_resume','cover_letter','package')),
  job_id uuid,
  job_revision_id uuid,
  resume_revision_id uuid,
  preferences_version integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','succeeded','failed','cancelled')),
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  input_snapshot_hash text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (user_id, id),
  FOREIGN KEY (run_id, user_id) REFERENCES public.assistant_runs(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id, user_id) REFERENCES public.jobs(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (resume_revision_id, user_id) REFERENCES public.resume_revisions(id, user_id) ON DELETE SET NULL
);

-- 6. assistant_recommendations
CREATE TABLE public.assistant_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid,
  job_id uuid NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  recommendation_band text NOT NULL CHECK (recommendation_band IN ('strong_apply','review','weak','blocked')),
  hard_blockers text[] NOT NULL DEFAULT '{}',
  reasoning text,
  evidence_gaps text[] NOT NULL DEFAULT '{}',
  strengths text[] NOT NULL DEFAULT '{}',
  concerns text[] NOT NULL DEFAULT '{}',
  proposed_action text,
  agent_version text NOT NULL DEFAULT '1.0',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id),
  FOREIGN KEY (task_id, user_id) REFERENCES public.assistant_tasks(id, user_id) ON DELETE SET NULL,
  FOREIGN KEY (job_id, user_id) REFERENCES public.jobs(id, user_id) ON DELETE CASCADE
);

-- 7. document_revisions (immutable)
CREATE TABLE public.document_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid,
  document_type text NOT NULL CHECK (document_type IN ('resume','cover_letter')),
  source_resume_revision_id uuid,
  revision_number integer NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  content_hash text NOT NULL,
  truth_check_status text NOT NULL DEFAULT 'pending' CHECK (truth_check_status IN ('pending','passed','failed')),
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  supersedes_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id),
  UNIQUE (user_id, content_hash, document_type),
  FOREIGN KEY (job_id, user_id) REFERENCES public.jobs(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (source_resume_revision_id, user_id) REFERENCES public.resume_revisions(id, user_id) ON DELETE SET NULL,
  FOREIGN KEY (supersedes_revision_id, user_id) REFERENCES public.document_revisions(id, user_id) ON DELETE SET NULL
);

-- 8. application_packages
CREATE TABLE public.application_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  resume_document_revision_id uuid,
  cover_letter_document_revision_id uuid,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  package_hash text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','approved','submitted','archived')),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id),
  FOREIGN KEY (job_id, user_id) REFERENCES public.jobs(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (resume_document_revision_id, user_id) REFERENCES public.document_revisions(id, user_id) ON DELETE SET NULL,
  FOREIGN KEY (cover_letter_document_revision_id, user_id) REFERENCES public.document_revisions(id, user_id) ON DELETE SET NULL
);

-- 9. approval_decisions
CREATE TABLE public.approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('document_revision','application_package','assistant_recommendation','resume_revision')),
  entity_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  comment text,
  approved_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id, decision, approved_hash)
);

-- 10. application_events
CREATE TABLE public.application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('saved','package_ready','submitted','interview','offer','rejected','withdrawn','note')),
  event_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','assistant','import')),
  external_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (job_id, user_id) REFERENCES public.jobs(id, user_id) ON DELETE CASCADE
);

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_revisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_facts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_revisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_events TO authenticated;
GRANT ALL ON public.search_profiles, public.resume_revisions, public.candidate_facts,
  public.assistant_runs, public.assistant_tasks, public.assistant_recommendations,
  public.document_revisions, public.application_packages, public.approval_decisions,
  public.application_events TO service_role;

-- ============ RLS ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['search_profiles','resume_revisions','candidate_facts','assistant_runs',
                           'assistant_tasks','assistant_recommendations','document_revisions',
                           'application_packages','approval_decisions','application_events']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t||'_select_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t||'_insert_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t||'_update_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t||'_delete_own', t);
  END LOOP;
END $$;

-- ============ IMMUTABILITY ============
CREATE OR REPLACE FUNCTION public.forbid_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'resume_revisions' AND NEW.approved_at IS DISTINCT FROM OLD.approved_at
     AND (to_jsonb(NEW) - 'approved_at') = (to_jsonb(OLD) - 'approved_at') THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'document_revisions'
     AND (to_jsonb(NEW) - 'approval_status' - 'truth_check_status') = (to_jsonb(OLD) - 'approval_status' - 'truth_check_status') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Revisions are immutable: create a new revision instead';
END $$;

CREATE TRIGGER resume_revisions_immutable
BEFORE UPDATE ON public.resume_revisions
FOR EACH ROW EXECUTE FUNCTION public.forbid_revision_mutation();

CREATE TRIGGER document_revisions_immutable
BEFORE UPDATE ON public.document_revisions
FOR EACH ROW EXECUTE FUNCTION public.forbid_revision_mutation();

-- ============ updated_at ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER search_profiles_touch BEFORE UPDATE ON public.search_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER assistant_tasks_touch BEFORE UPDATE ON public.assistant_tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER assistant_recommendations_touch BEFORE UPDATE ON public.assistant_recommendations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER application_packages_touch BEFORE UPDATE ON public.application_packages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ SUBMITTED GUARD ON JOBS ============
CREATE OR REPLACE FUNCTION public.enforce_submitted_requires_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pipeline_status IN ('applied','submitted')
     AND (TG_OP = 'INSERT' OR OLD.pipeline_status IS DISTINCT FROM NEW.pipeline_status) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.application_events e
      WHERE e.job_id = NEW.id AND e.user_id = NEW.user_id AND e.event_type = 'submitted'
    ) THEN
      RAISE EXCEPTION 'Cannot mark job as submitted without a recorded submission event';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER jobs_submitted_guard
BEFORE INSERT OR UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.enforce_submitted_requires_event();

-- ============ IDEMPOTENT APPROVAL RPC ============
CREATE OR REPLACE FUNCTION public.record_approval_decision(
  _entity_type text,
  _entity_id uuid,
  _decision text,
  _expected_hash text DEFAULT NULL,
  _comment text DEFAULT NULL
)
RETURNS public.approval_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _current_hash text;
  _row public.approval_decisions;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF _entity_type = 'document_revision' THEN
    SELECT content_hash INTO _current_hash FROM public.document_revisions WHERE id = _entity_id AND user_id = _uid;
  ELSIF _entity_type = 'resume_revision' THEN
    SELECT content_hash INTO _current_hash FROM public.resume_revisions WHERE id = _entity_id AND user_id = _uid;
  ELSIF _entity_type = 'application_package' THEN
    SELECT package_hash INTO _current_hash FROM public.application_packages WHERE id = _entity_id AND user_id = _uid;
  ELSIF _entity_type = 'assistant_recommendation' THEN
    SELECT id::text INTO _current_hash FROM public.assistant_recommendations WHERE id = _entity_id AND user_id = _uid;
  ELSE
    RAISE EXCEPTION 'Unknown entity type %', _entity_type;
  END IF;

  IF _current_hash IS NULL THEN
    RAISE EXCEPTION 'Entity not found or not owned by caller';
  END IF;

  IF _expected_hash IS NOT NULL AND _expected_hash <> _current_hash THEN
    RAISE EXCEPTION 'Stale revision: entity changed since it was reviewed';
  END IF;

  -- idempotent: same entity + same decision + same hash is a no-op
  SELECT * INTO _row FROM public.approval_decisions
  WHERE user_id = _uid AND entity_type = _entity_type AND entity_id = _entity_id
    AND decision = _decision AND approved_hash IS NOT DISTINCT FROM _current_hash;

  IF _row.id IS NULL THEN
    INSERT INTO public.approval_decisions (user_id, entity_type, entity_id, decision, comment, approved_hash)
    VALUES (_uid, _entity_type, _entity_id, _decision, _comment, _current_hash)
    RETURNING * INTO _row;
  END IF;

  -- propagate decision to the entity, without touching unrelated state
  IF _entity_type = 'document_revision' THEN
    UPDATE public.document_revisions SET approval_status = CASE WHEN _decision = 'approved' THEN 'approved' ELSE 'rejected' END
    WHERE id = _entity_id AND user_id = _uid AND approval_status IS DISTINCT FROM (CASE WHEN _decision = 'approved' THEN 'approved' ELSE 'rejected' END);
  ELSIF _entity_type = 'application_package' THEN
    UPDATE public.application_packages
      SET status = CASE WHEN _decision = 'approved' THEN 'approved' ELSE 'draft' END,
          approved_at = CASE WHEN _decision = 'approved' THEN COALESCE(approved_at, now()) ELSE NULL END
    WHERE id = _entity_id AND user_id = _uid;
  ELSIF _entity_type = 'resume_revision' THEN
    UPDATE public.resume_revisions SET approved_at = COALESCE(approved_at, now())
    WHERE id = _entity_id AND user_id = _uid AND _decision = 'approved';
  ELSIF _entity_type = 'assistant_recommendation' THEN
    UPDATE public.assistant_recommendations
      SET status = CASE WHEN _decision = 'approved' THEN 'accepted' ELSE 'rejected' END
    WHERE id = _entity_id AND user_id = _uid;
  END IF;

  RETURN _row;
END $$;

GRANT EXECUTE ON FUNCTION public.record_approval_decision(text, uuid, text, text, text) TO authenticated;

-- ============ INDEXES ============
CREATE INDEX idx_search_profiles_user_active ON public.search_profiles(user_id, active);
CREATE INDEX idx_resume_revisions_user ON public.resume_revisions(user_id, revision_number DESC);
CREATE INDEX idx_candidate_facts_revision ON public.candidate_facts(user_id, resume_revision_id);
CREATE INDEX idx_assistant_tasks_status ON public.assistant_tasks(user_id, status, lease_expires_at);
CREATE INDEX idx_assistant_recs_job ON public.assistant_recommendations(user_id, job_id);
CREATE INDEX idx_document_revisions_job ON public.document_revisions(user_id, job_id, document_type, revision_number DESC);
CREATE INDEX idx_application_events_job ON public.application_events(user_id, job_id, event_at DESC);
