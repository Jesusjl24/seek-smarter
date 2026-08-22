-- Manual verification for the Job Assistant data model.
-- Run with two real auth users; replace the UUIDs below.
-- Each block should behave as described in the comment above it.

\set user_a '00000000-0000-0000-0000-00000000000a'
\set user_b '00000000-0000-0000-0000-00000000000b'

-- 1. Ownership: user B must not see user A's rows.
--    select set_config('request.jwt.claims', json_build_object('sub', :'user_b')::text, true);
--    select count(*) from public.resume_revisions;              -- expect 0 for A's rows
--    insert into public.resume_revisions(user_id, revision_number, raw_text, content_hash)
--    values (:'user_a', 1, 'x', 'h');                            -- expect RLS violation

-- 2. Immutable revisions: content edits are rejected.
--    update public.resume_revisions set raw_text = 'tampered' where user_id = :'user_a';
--    -- expect: ERROR  Revisions are immutable: create a new revision instead

-- 3. Idempotent approval: calling twice yields one row.
--    select public.record_approval_decision('document_revision', '<doc_id>', 'approved', '<content_hash>');
--    select public.record_approval_decision('document_revision', '<doc_id>', 'approved', '<content_hash>');
--    select count(*) from public.approval_decisions
--      where entity_id = '<doc_id>' and decision = 'approved';   -- expect 1

-- 4. Stale revision rejection.
--    select public.record_approval_decision('document_revision', '<doc_id>', 'approved', 'stale-hash');
--    -- expect: ERROR  Stale revision: entity changed since it was reviewed

-- 5. Rejecting a recommendation must not mutate unrelated state.
--    select public.record_approval_decision('assistant_recommendation', '<rec_id>', 'rejected');
--    select status from public.assistant_recommendations where id = '<rec_id>';   -- expect rejected
--    select pipeline_status from public.jobs where id = '<job_id>';               -- expect unchanged

-- 6. A job cannot be marked submitted without an application event.
--    update public.jobs set pipeline_status = 'applied' where id = '<job_id>';
--    -- expect: ERROR  Cannot mark job as submitted without a recorded submission event
--    insert into public.application_events(user_id, job_id, event_type, source)
--    values (:'user_a', '<job_id>', 'submitted', 'manual');
--    update public.jobs set pipeline_status = 'applied' where id = '<job_id>';    -- expect success
