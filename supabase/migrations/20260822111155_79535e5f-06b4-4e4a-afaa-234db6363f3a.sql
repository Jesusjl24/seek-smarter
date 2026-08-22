-- Application document workflow: richer provenance on document revisions,
-- truth-check states, rendered artifact paths, and package hash pinning.

ALTER TABLE public.document_revisions
  ADD COLUMN IF NOT EXISTS agent_version text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS generated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS supporting_fact_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS truth_check jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS docx_path text,
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS label text;

ALTER TABLE public.document_revisions
  DROP CONSTRAINT IF EXISTS document_revisions_user_id_content_hash_document_type_key;

ALTER TABLE public.document_revisions
  DROP CONSTRAINT IF EXISTS document_revisions_truth_check_status_check;
ALTER TABLE public.document_revisions
  ADD CONSTRAINT document_revisions_truth_check_status_check
  CHECK (truth_check_status IN ('pending','passed','failed','needs_evidence','manually_approved'));

ALTER TABLE public.application_packages
  ADD COLUMN IF NOT EXISTS resume_content_hash text,
  ADD COLUMN IF NOT EXISTS cover_letter_content_hash text;

CREATE OR REPLACE FUNCTION public.record_approval_decision(_entity_type text, _entity_id uuid, _decision text, _expected_hash text DEFAULT NULL::text, _comment text DEFAULT NULL::text)
 RETURNS approval_decisions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _current_hash text;
  _tc text;
  _row public.approval_decisions;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF _entity_type = 'document_revision' THEN
    SELECT content_hash, truth_check_status INTO _current_hash, _tc
      FROM public.document_revisions WHERE id = _entity_id AND user_id = _uid;
    IF _decision = 'approved' AND _tc IS DISTINCT FROM 'passed' AND _tc IS DISTINCT FROM 'manually_approved' THEN
      RAISE EXCEPTION 'Truth check has not passed: unsupported claims must be evidenced or manually approved first';
    END IF;
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

  SELECT * INTO _row FROM public.approval_decisions
  WHERE user_id = _uid AND entity_type = _entity_type AND entity_id = _entity_id
    AND decision = _decision AND approved_hash IS NOT DISTINCT FROM _current_hash;

  IF _row.id IS NULL THEN
    INSERT INTO public.approval_decisions (user_id, entity_type, entity_id, decision, comment, approved_hash)
    VALUES (_uid, _entity_type, _entity_id, _decision, _comment, _current_hash)
    RETURNING * INTO _row;
  END IF;

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
END $function$;

DROP POLICY IF EXISTS "Users read own document artifacts" ON storage.objects;
CREATE POLICY "Users read own document artifacts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users write own document artifacts" ON storage.objects;
CREATE POLICY "Users write own document artifacts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own document artifacts" ON storage.objects;
CREATE POLICY "Users delete own document artifacts" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);