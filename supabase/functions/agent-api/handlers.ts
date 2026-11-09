import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./errors.ts";
import { SCHEMA_VERSION } from "./schemas.ts";
import type {
  ClaimBody,
  CompleteBody,
  DocumentBody,
  FailBody,
  HeartbeatBody,
  RecommendationBody,
} from "./schemas.ts";
import type { AgentIdentity } from "./auth.ts";

const MAX_ATTEMPTS = 5;

export async function handleMatches(
  admin: SupabaseClient,
  identity: AgentIdentity,
  since: string,
  minGrade: "A" | "B",
) {
  const sinceDate = new Date(since);
  if (!since || Number.isNaN(sinceDate.getTime())) throw new ApiError("invalid_request", "since must be ISO8601");
  const grades = minGrade === "B" ? ["A", "B"] : ["A"];
  const { data, error } = await admin
    .from("job_matches")
    .select("job_id,match_score,grade,why_apply,reasoning,strategic_advice,scored_at,jobs!inner(title,company,location,job_url,pipeline_status)")
    .eq("user_id", identity.ownerUserId)
    .gt("scored_at", sinceDate.toISOString())
    .in("grade", grades)
    .in("jobs.pipeline_status", ["inbox", "shortlist"])
    .order("scored_at", { ascending: true });
  if (error) throw new ApiError("internal_error", "Could not read matches");
  const matches = (data ?? []).map((row) => ({
    job_id: row.job_id,
    score: row.match_score,
    grade: row.grade,
    why_apply: row.why_apply || row.strategic_advice || row.reasoning,
    scored_at: row.scored_at,
    job: row.jobs,
  }));
  return { schema_version: SCHEMA_VERSION, matches, next_since: matches.at(-1)?.scored_at ?? sinceDate.toISOString() };
}

interface TaskRow {
  id: string;
  user_id: string;
  run_id: string | null;
  task_type: string;
  job_id: string | null;
  job_revision_id: string | null;
  resume_revision_id: string | null;
  preferences_version: number | null;
  status: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  input_snapshot_hash: string | null;
}

/** Owner binding + live lease check. */
async function loadLeasedTask(
  admin: SupabaseClient,
  identity: AgentIdentity,
  taskId: string,
): Promise<TaskRow> {
  const { data: task } = await admin
    .from("assistant_tasks")
    .select("*")
    .eq("id", taskId)
    .eq("user_id", identity.ownerUserId)
    .maybeSingle();

  if (!task) throw new ApiError("not_found", "Task not found for this owner");
  if (task.lease_owner !== identity.agentId) {
    throw new ApiError("lease_lost", "Task is not leased by this agent");
  }
  if (task.status !== "leased") {
    throw new ApiError("lease_lost", `Task is ${task.status}, not leased`);
  }
  if (!task.lease_expires_at || new Date(task.lease_expires_at).getTime() <= Date.now()) {
    throw new ApiError("lease_lost", "Task lease has expired");
  }
  return task as TaskRow;
}

function assertSnapshot(task: TaskRow, snapshotHash: string) {
  if (task.input_snapshot_hash && task.input_snapshot_hash !== snapshotHash) {
    throw new ApiError("stale_snapshot", "Task input snapshot has changed since it was claimed");
  }
}

function assertRun(task: TaskRow, runId: string) {
  if (task.run_id && task.run_id !== runId) {
    throw new ApiError("invalid_request", "run_id does not match the task's run");
  }
}

export async function handleClaim(
  admin: SupabaseClient,
  identity: AgentIdentity,
  body: ClaimBody,
) {
  const leaseUntil = new Date(Date.now() + body.lease_seconds * 1000).toISOString();
  const nowIso = new Date().toISOString();

  let query = admin
    .from("assistant_tasks")
    .select("id, task_type, run_id, job_id, attempt_count, input_snapshot_hash, status, lease_expires_at")
    .eq("user_id", identity.ownerUserId)
    .or(`status.eq.pending,and(status.eq.leased,lease_expires_at.lt.${nowIso})`)
    .lt("attempt_count", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(body.max_tasks);

  if (body.task_types?.length) query = query.in("task_type", body.task_types);

  const { data: candidates, error } = await query;
  if (error) throw new ApiError("internal_error", "Could not read task queue");

  const claimed: unknown[] = [];
  for (const candidate of candidates ?? []) {
    const { data: updated } = await admin
      .from("assistant_tasks")
      .update({
        status: "leased",
        lease_owner: identity.agentId,
        lease_expires_at: leaseUntil,
        attempt_count: candidate.attempt_count + 1,
      })
      .eq("id", candidate.id)
      .eq("user_id", identity.ownerUserId)
      .eq("attempt_count", candidate.attempt_count)
      .select("id, run_id, task_type, job_id, attempt_count, lease_expires_at, input_snapshot_hash")
      .maybeSingle();
    if (updated) claimed.push(updated);
  }

  return { schema_version: SCHEMA_VERSION, request_id: identity.requestId, tasks: claimed };
}

export async function handleContext(
  admin: SupabaseClient,
  identity: AgentIdentity,
  taskId: string,
) {
  const task = await loadLeasedTask(admin, identity, taskId);

  const [runRes, jobRevRes, jobRes, resumeRes, prefsRes] = await Promise.all([
    task.run_id
      ? admin.from("assistant_runs").select("id, agent_version, model").eq("id", task.run_id).maybeSingle()
      : Promise.resolve({ data: null }),
    task.job_revision_id
      ? admin.from("job_revisions").select("*").eq("id", task.job_revision_id).eq("user_id", task.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    task.job_id
      ? admin.from("jobs").select("*").eq("id", task.job_id).eq("user_id", task.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("resume_revisions")
      .select("id, revision_number, content_hash, raw_text, structured_profile, approved_at")
      .eq("user_id", task.user_id)
      .not("approved_at", "is", null)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("candidate_preferences").select("*").eq("user_id", task.user_id).maybeSingle(),
  ]);

  const resume = resumeRes.data;
  const facts = resume
    ? (
        await admin
          .from("candidate_facts")
          .select("fact_type, fact_text, evidence_reference")
          .eq("user_id", task.user_id)
          .eq("resume_revision_id", resume.id)
          .eq("verified", true)
      ).data ?? []
    : [];

  const rev = jobRevRes.data;
  const job = jobRes.data;
  const prefs = prefsRes.data;

  return {
    schema_version: SCHEMA_VERSION,
    request_id: identity.requestId,
    task: {
      id: task.id,
      task_type: task.task_type,
      attempt_count: task.attempt_count,
      lease_expires_at: task.lease_expires_at,
      input_snapshot_hash: task.input_snapshot_hash,
      preferences_version: task.preferences_version,
    },
    run: runRes.data ? { id: runRes.data.id, agent_version: runRes.data.agent_version } : null,
    job: rev
      ? {
          id: rev.job_id,
          job_revision_id: rev.id,
          revision_number: rev.revision_number,
          title: rev.title,
          company: rev.company,
          location: rev.location,
          salary_range: rev.salary_range,
          work_type: rev.work_type,
          work_arrangement: rev.work_arrangement,
          description: rev.description,
          source_url: rev.source_url,
          content_hash: rev.content_hash,
          provider: {
            name: rev.provider,
            external_id: rev.provider_external_id,
            date_posted: rev.date_posted,
          },
        }
      : job
        ? {
            id: job.id,
            job_revision_id: null,
            title: job.title,
            company: job.company,
            location: job.location,
            salary_range: job.salary_range,
            work_type: job.work_type,
            work_arrangement: job.work_arrangement,
            description: job.full_description ?? job.description_snippet,
            source_url: job.job_url,
            provider: { name: "seek", external_id: job.seek_job_id, date_posted: job.date_posted },
          }
        : null,
    resume_revision: resume
      ? {
          id: resume.id,
          revision_number: resume.revision_number,
          content_hash: resume.content_hash,
          raw_text: resume.raw_text,
          structured_profile: resume.structured_profile,
        }
      : null,
    candidate_facts: facts,
    preferences: prefs
      ? {
          job_goals: prefs.job_goals,
          career_direction: prefs.career_direction,
          target_titles: prefs.target_titles,
          target_industries: prefs.target_industries,
          excluded_titles: prefs.excluded_titles,
          salary_min: prefs.salary_min,
          salary_target: prefs.salary_target,
          currency: prefs.currency,
          locations: prefs.locations,
          work_arrangements: prefs.work_arrangements,
          work_types: prefs.work_types,
          mandatory_qualifications: prefs.mandatory_qualifications,
          dealbreakers: prefs.dealbreakers,
          verified_experience: prefs.verified_experience,
        }
      : null,
    score_policy: {
      strong: prefs?.policy_strong ?? 80,
      review: prefs?.policy_review ?? 75,
    },
  };
}

export async function handleHeartbeat(
  admin: SupabaseClient,
  identity: AgentIdentity,
  taskId: string,
  body: HeartbeatBody,
) {
  const task = await loadLeasedTask(admin, identity, taskId);
  assertRun(task, body.run_id);
  const leaseUntil = new Date(Date.now() + body.lease_seconds * 1000).toISOString();
  await admin
    .from("assistant_tasks")
    .update({ lease_expires_at: leaseUntil })
    .eq("id", task.id)
    .eq("user_id", identity.ownerUserId)
    .eq("lease_owner", identity.agentId);
  return { schema_version: SCHEMA_VERSION, request_id: identity.requestId, task_id: task.id, lease_expires_at: leaseUntil };
}

export async function handleRecommendation(
  admin: SupabaseClient,
  identity: AgentIdentity,
  taskId: string,
  body: RecommendationBody,
) {
  const task = await loadLeasedTask(admin, identity, taskId);
  assertRun(task, body.run_id);
  assertSnapshot(task, body.input_snapshot_hash);
  if (task.job_id && task.job_id !== body.job_id) {
    throw new ApiError("invalid_request", "job_id does not match the task");
  }

  const { data, error } = await admin
    .from("assistant_recommendations")
    .insert({
      user_id: identity.ownerUserId,
      task_id: task.id,
      job_id: body.job_id,
      score: body.score,
      recommendation_band: body.recommendation_band,
      hard_blockers: body.hard_blockers,
      reasoning: body.reasoning ?? null,
      evidence_gaps: body.evidence_gaps,
      strengths: body.strengths,
      concerns: body.concerns,
      proposed_action: body.proposed_action ?? null,
      agent_version: body.agent_version,
      status: "pending",
    })
    .select("id, status, created_at")
    .single();

  if (error) throw new ApiError("internal_error", "Could not store recommendation");
  return { schema_version: SCHEMA_VERSION, request_id: identity.requestId, recommendation: data };
}

export async function handleDocument(
  admin: SupabaseClient,
  identity: AgentIdentity,
  taskId: string,
  body: DocumentBody,
) {
  const task = await loadLeasedTask(admin, identity, taskId);
  assertRun(task, body.run_id);
  assertSnapshot(task, body.input_snapshot_hash);

  const { data: resume } = await admin
    .from("resume_revisions")
    .select("id, approved_at")
    .eq("id", body.source_resume_revision_id)
    .eq("user_id", identity.ownerUserId)
    .maybeSingle();
  if (!resume) throw new ApiError("not_found", "Source resume revision not found for this owner");
  if (!resume.approved_at) throw new ApiError("stale_snapshot", "Source resume revision is not approved");

  const { data: latest } = await admin
    .from("document_revisions")
    .select("id, revision_number")
    .eq("user_id", identity.ownerUserId)
    .eq("job_id", body.job_id)
    .eq("document_type", body.document_type)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await admin
    .from("document_revisions")
    .insert({
      user_id: identity.ownerUserId,
      job_id: body.job_id,
      document_type: body.document_type,
      source_resume_revision_id: body.source_resume_revision_id,
      revision_number: (latest?.revision_number ?? 0) + 1,
      content: body.content,
      content_hash: body.content_hash,
      truth_check_status: body.truth_check_status,
      // The agent may never approve its own output.
      approval_status: "pending",
      supersedes_revision_id: body.supersedes_revision_id ?? latest?.id ?? null,
    })
    .select("id, revision_number, document_type, approval_status, truth_check_status")
    .single();

  if (error) throw new ApiError("internal_error", "Could not store document revision");
  return { schema_version: SCHEMA_VERSION, request_id: identity.requestId, document_revision: data };
}

export async function handleComplete(
  admin: SupabaseClient,
  identity: AgentIdentity,
  taskId: string,
  body: CompleteBody,
) {
  const task = await loadLeasedTask(admin, identity, taskId);
  assertRun(task, body.run_id);
  assertSnapshot(task, body.input_snapshot_hash);

  await admin
    .from("assistant_tasks")
    .update({ status: "succeeded", lease_owner: null, lease_expires_at: null, last_error: null })
    .eq("id", task.id)
    .eq("user_id", identity.ownerUserId);

  if (task.run_id) {
    const { data: run } = await admin
      .from("assistant_runs")
      .select("jobs_assessed, recommendations_count, questions_count")
      .eq("id", task.run_id)
      .eq("user_id", identity.ownerUserId)
      .maybeSingle();
    if (run) {
      await admin
        .from("assistant_runs")
        .update({
          jobs_assessed: run.jobs_assessed + body.jobs_assessed,
          recommendations_count: run.recommendations_count + body.recommendations_count,
          questions_count: run.questions_count + body.questions_count,
        })
        .eq("id", task.run_id)
        .eq("user_id", identity.ownerUserId);
    }
  }

  return { schema_version: SCHEMA_VERSION, request_id: identity.requestId, task_id: task.id, status: "succeeded" };
}

export async function handleFail(
  admin: SupabaseClient,
  identity: AgentIdentity,
  taskId: string,
  body: FailBody,
) {
  const task = await loadLeasedTask(admin, identity, taskId);
  assertRun(task, body.run_id);

  const retry = body.retryable && task.attempt_count < MAX_ATTEMPTS;
  await admin
    .from("assistant_tasks")
    .update({
      status: retry ? "pending" : "failed",
      lease_owner: null,
      lease_expires_at: null,
      last_error: `${body.error_code}: ${body.error_message}`.slice(0, 2000),
    })
    .eq("id", task.id)
    .eq("user_id", identity.ownerUserId);

  return {
    schema_version: SCHEMA_VERSION,
    request_id: identity.requestId,
    task_id: task.id,
    status: retry ? "pending" : "failed",
    retryable: retry,
  };
}
