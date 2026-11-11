import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type ActorType = "script" | "agent";
export type StageId = "scout" | "gatekeeper" | "matcher" | "skeptic" | "briefer";

export const STAGE_META: Record<StageId, { label: string; defaultActorType: ActorType; defaultActorName: string }> = {
  scout: { label: "Scout", defaultActorType: "script", defaultActorName: "SEEK search via Firecrawl" },
  gatekeeper: { label: "Gatekeeper", defaultActorType: "script", defaultActorName: "Salary, contract, industry, and duplicate checks" },
  matcher: { label: "Matcher", defaultActorType: "agent", defaultActorName: "Grades each role against your resume and goals" },
  skeptic: { label: "Analyst / Skeptic", defaultActorType: "script", defaultActorName: "Checks risks, chance, and whether the grade holds up" },
  briefer: { label: "Briefer", defaultActorType: "agent", defaultActorName: "Writes the morning briefing" },
};

export type TraceEvidence = { kind: string; text: string };
export type TraceCounts = Record<string, number | string | null | undefined>;
export type Funnel = { found: number; passed_filters: number; graded: number; picks: number; worth_a_look: number; dropped: number };

export type TraceStepInput = {
  stage: StageId;
  actorType?: ActorType;
  actorName?: string;
  model?: string | null;
  sortOrder: number;
};

function now() { return new Date().toISOString(); }
function asJson(value: unknown, fallback: unknown = {}) { return JSON.stringify(value ?? fallback); }
function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function startRunTrace(db: Database.Database, userId: string) {
  const id = randomUUID();
  const started = now();
  db.prepare("INSERT INTO run_traces(id,user_id,briefing_id,started_at,finished_at,status,funnel_json,summary_text,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(id, userId, null, started, null, "running", asJson({ found: 0, passed_filters: 0, graded: 0, picks: 0, worth_a_look: 0, dropped: 0 }), "", started);
  return { id, userId, started_at: started };
}

export function startTraceStep(db: Database.Database, traceId: string, input: TraceStepInput) {
  const meta = STAGE_META[input.stage];
  const id = randomUUID();
  const started = now();
  db.prepare("INSERT INTO run_trace_steps(id,trace_id,stage,stage_label,actor_type,actor_name,model,started_at,finished_at,inputs_summary,outputs_summary,counts_json,error,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, traceId, input.stage, meta.label, input.actorType || meta.defaultActorType, input.actorName || meta.defaultActorName, input.model || null, started, null, "", "", asJson({}), null, input.sortOrder);
  return { id, started_at: started };
}

export function finishTraceStep(db: Database.Database, stepId: string, fields: { inputs_summary?: string; outputs_summary?: string; counts?: TraceCounts; error?: string | null }) {
  db.prepare("UPDATE run_trace_steps SET finished_at=?, inputs_summary=?, outputs_summary=?, counts_json=?, error=? WHERE id=?")
    .run(now(), fields.inputs_summary || "", fields.outputs_summary || "", asJson(fields.counts || {}), fields.error || null, stepId);
}

export function recordDecision(db: Database.Database, input: {
  traceId: string; stepId?: string | null; jobId?: string | null; seekJobId?: string | null;
  title?: string | null; company?: string | null; stage: StageId; decision: string; reason: string;
  evidence?: TraceEvidence[]; grade?: string | null; score?: number | null; criteria?: unknown;
}) {
  db.prepare("INSERT INTO run_trace_decisions(id,trace_id,step_id,job_id,seek_job_id,title,company,stage,decision,reason,evidence_json,grade,score,criteria_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(randomUUID(), input.traceId, input.stepId || null, input.jobId || null, input.seekJobId || null, input.title || null, input.company || null, input.stage, input.decision, input.reason || "", asJson(input.evidence || [], []), input.grade || null, input.score ?? null, input.criteria == null ? null : asJson(input.criteria), now());
}

export function finishRunTrace(db: Database.Database, traceId: string, fields: { status?: "completed" | "failed"; briefingId?: string | null; funnel?: Funnel; summaryText?: string }) {
  db.prepare("UPDATE run_traces SET finished_at=?, status=?, briefing_id=?, funnel_json=?, summary_text=? WHERE id=?")
    .run(now(), fields.status || "completed", fields.briefingId || null, asJson(fields.funnel || {}), fields.summaryText || "", traceId);
}

export function formatFunnel(funnel: Funnel): string {
  return `${funnel.found} found → ${funnel.passed_filters} passed filters → ${funnel.graded} graded → ${funnel.picks} picks`;
}

export function serializeTrace(row: any, steps: any[], decisions: any[]) {
  const funnel = parseJson<Funnel>(row?.funnel_json, { found: 0, passed_filters: 0, graded: 0, picks: 0, worth_a_look: 0, dropped: 0 });
  return {
    id: row.id,
    status: row.status,
    started_at: row.started_at,
    finished_at: row.finished_at,
    briefing_id: row.briefing_id,
    summary_text: row.summary_text,
    funnel,
    funnel_text: formatFunnel(funnel),
    steps: steps.map((step) => ({
      id: step.id,
      stage: step.stage,
      label: step.stage_label,
      actor_type: step.actor_type,
      actor_name: step.actor_name,
      model: step.model,
      started_at: step.started_at,
      finished_at: step.finished_at,
      inputs_summary: step.inputs_summary,
      outputs_summary: step.outputs_summary,
      counts: parseJson(step.counts_json, {}),
      error: step.error,
    })),
    decisions: decisions.map((item) => ({
      id: item.id,
      step_id: item.step_id,
      job_id: item.job_id,
      seek_job_id: item.seek_job_id,
      title: item.title,
      company: item.company,
      stage: item.stage,
      decision: item.decision,
      reason: item.reason,
      evidence: parseJson(item.evidence_json, []),
      grade: item.grade,
      score: item.score,
      criteria: parseJson(item.criteria_json, null),
    })),
  };
}

export function loadLatestTrace(db: Database.Database, userId: string) {
  const row = db.prepare("SELECT * FROM run_traces WHERE user_id=? ORDER BY started_at DESC LIMIT 1").get(userId) as any;
  if (!row) return null;
  const steps = db.prepare("SELECT * FROM run_trace_steps WHERE trace_id=? ORDER BY sort_order, started_at").all(row.id) as any[];
  const decisions = db.prepare("SELECT * FROM run_trace_decisions WHERE trace_id=? ORDER BY created_at").all(row.id) as any[];
  return serializeTrace(row, steps, decisions);
}

export function loadJobDecisionTrail(db: Database.Database, userId: string, jobId: string) {
  const job = db.prepare("SELECT id,title,company,location,salary_range,job_url,pipeline_status,filter_reason,seek_job_id FROM jobs WHERE id=? AND user_id=?").get(jobId, userId) as any;
  if (!job) return null;
  const traceRow = db.prepare("SELECT t.* FROM run_traces t JOIN run_trace_decisions d ON d.trace_id=t.id WHERE t.user_id=? AND d.job_id=? ORDER BY t.started_at DESC LIMIT 1").get(userId, jobId) as any
    || db.prepare("SELECT * FROM run_traces WHERE user_id=? ORDER BY started_at DESC LIMIT 1").get(userId) as any;
  if (!traceRow) return { job, trace_id: null, stages: [] as any[] };
  const decisions = db.prepare("SELECT * FROM run_trace_decisions WHERE trace_id=? AND job_id=? ORDER BY created_at").all(traceRow.id, jobId) as any[];
  const steps = db.prepare("SELECT * FROM run_trace_steps WHERE trace_id=? ORDER BY sort_order, started_at").all(traceRow.id) as any[];
  const byId = new Map(steps.map((step) => [step.id, step]));
  return {
    job,
    trace_id: traceRow.id,
    stages: decisions.map((item) => ({
      stage: item.stage,
      label: STAGE_META[item.stage as StageId]?.label || item.stage,
      actor_type: byId.get(item.step_id)?.actor_type || STAGE_META[item.stage as StageId]?.defaultActorType || "script",
      actor_name: byId.get(item.step_id)?.actor_name || STAGE_META[item.stage as StageId]?.defaultActorName,
      model: byId.get(item.step_id)?.model || null,
      decision: item.decision,
      reason: item.reason,
      evidence: parseJson(item.evidence_json, []),
      grade: item.grade,
      score: item.score,
      criteria: parseJson(item.criteria_json, null),
    })),
  };
}
