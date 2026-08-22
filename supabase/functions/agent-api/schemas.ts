import { z } from "npm:zod@3.23.8";

export const SCHEMA_VERSION = "1.0";

/** Envelope required on every write. */
export const WriteEnvelope = z.object({
  request_id: z.string().min(1).max(128),
  idempotency_key: z.string().min(8).max(128),
  agent_id: z.string().min(1).max(128),
  run_id: z.string().uuid(),
  task_id: z.string().uuid(),
  schema_version: z.literal(SCHEMA_VERSION),
  input_snapshot_hash: z.string().min(8).max(128),
  agent_version: z.string().min(1).max(64),
});

export const ClaimRequest = z
  .object({
    request_id: z.string().min(1).max(128),
    idempotency_key: z.string().min(8).max(128),
    agent_id: z.string().min(1).max(128),
    schema_version: z.literal(SCHEMA_VERSION),
    agent_version: z.string().min(1).max(64),
    max_tasks: z.number().int().min(1).max(5).default(1),
    lease_seconds: z.number().int().min(60).max(900).default(300),
    task_types: z
      .array(z.enum(["discover", "assess", "tailor_resume", "cover_letter", "package"]))
      .optional(),
  })
  .strict();

export const HeartbeatRequest = WriteEnvelope.extend({
  lease_seconds: z.number().int().min(60).max(900).default(300),
}).strict();

export const RecommendationRequest = WriteEnvelope.extend({
  job_id: z.string().uuid(),
  score: z.number().int().min(0).max(100),
  recommendation_band: z.enum(["strong_apply", "review", "weak", "blocked"]),
  hard_blockers: z.array(z.string().max(500)).max(50).default([]),
  reasoning: z.string().max(8000).optional(),
  evidence_gaps: z.array(z.string().max(500)).max(50).default([]),
  strengths: z.array(z.string().max(500)).max(50).default([]),
  concerns: z.array(z.string().max(500)).max(50).default([]),
  proposed_action: z.string().max(500).optional(),
}).strict();

export const DocumentRequest = WriteEnvelope.extend({
  job_id: z.string().uuid(),
  document_type: z.enum(["resume", "cover_letter"]),
  source_resume_revision_id: z.string().uuid(),
  content: z.record(z.unknown()),
  content_hash: z.string().min(8).max(128),
  truth_check_status: z.enum(["pending", "passed", "failed"]).default("pending"),
  supersedes_revision_id: z.string().uuid().nullish(),
}).strict();

export const CompleteRequest = WriteEnvelope.extend({
  jobs_assessed: z.number().int().min(0).max(10000).default(0),
  recommendations_count: z.number().int().min(0).max(10000).default(0),
  questions_count: z.number().int().min(0).max(10000).default(0),
}).strict();

export const FailRequest = WriteEnvelope.extend({
  error_code: z.string().min(1).max(64),
  error_message: z.string().min(1).max(2000),
  retryable: z.boolean().default(false),
}).strict();

export type ClaimBody = z.infer<typeof ClaimRequest>;
export type HeartbeatBody = z.infer<typeof HeartbeatRequest>;
export type RecommendationBody = z.infer<typeof RecommendationRequest>;
export type DocumentBody = z.infer<typeof DocumentRequest>;
export type CompleteBody = z.infer<typeof CompleteRequest>;
export type FailBody = z.infer<typeof FailRequest>;
