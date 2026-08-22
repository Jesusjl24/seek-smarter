// Types for the Job Assistant surfaces (Today + Assistant Activity).
// Everything here is derived from data the app already owns — jobs, matches
// and artifacts. Nothing is fabricated: channels that are not connected yet
// report `connected: false` and an empty event list.

import type { JobWithMatch } from "@/types/job";

export type AssistantRunStatus = "never_run" | "completed";

/** A decision the assistant is waiting on from the user. */
export interface AssistantQuestion {
  job_id: string;
  title: string;
  company: string;
  score: number;
  band_label: string;
  question: string;
}

/** A tailored document or cover letter waiting to be reviewed. */
export interface AssistantDocument {
  job_id: string;
  title: string;
  company: string;
  kind: "tailored_resume" | "cover_letter";
  created_at: string;
}

/** A job whose resume + cover letter are both drafted, ready for approval. */
export interface AssistantPackage {
  job_id: string;
  title: string;
  company: string;
  score: number;
  band_label: string;
  ready_at: string;
}

/** Something that did not complete and can safely be retried. */
export interface AssistantFailure {
  job_id: string;
  title: string;
  company: string;
  reason: string;
  action: "score" | "tailor" | "cover_letter";
}

export interface TelegramActivity {
  connected: boolean;
  events: Array<{ id: string; at: string; text: string }>;
}

export interface AssistantSnapshot {
  /** True once a real assistant backend is wired up. Currently always false. */
  assistant_connected: boolean;
  status: AssistantRunStatus;
  /** Timestamp of the most recent ingestion run, if any. */
  last_run_at: string | null;
  jobs_found: number;
  jobs_assessed: number;
  strong_apply: number;
  review: number;
  deprioritise: number;
  questions: AssistantQuestion[];
  documents_ready: AssistantDocument[];
  packages_ready: AssistantPackage[];
  telegram: TelegramActivity;
  failures: AssistantFailure[];
  /** Jobs from the latest run, newest first — used for the Today review queue. */
  run_jobs: JobWithMatch[];
}

// ---------------------------------------------------------------------------
// Durable Job Assistant data model (database-backed).
// ---------------------------------------------------------------------------

export type SearchProfile = Tables<"search_profiles">;
export type ResumeRevision = Tables<"resume_revisions">;
export type CandidateFact = Tables<"candidate_facts">;
export type AssistantRun = Tables<"assistant_runs">;
export type AssistantTask = Tables<"assistant_tasks">;
export type AssistantRecommendation = Tables<"assistant_recommendations">;
export type DocumentRevision = Tables<"document_revisions">;
export type ApplicationPackage = Tables<"application_packages">;
export type ApprovalDecision = Tables<"approval_decisions">;
export type ApplicationEvent = Tables<"application_events">;

export type ApplicationEventInsert = TablesInsert<"application_events">;

export type ApprovalEntityType =
  | "document_revision"
  | "application_package"
  | "assistant_recommendation"
  | "resume_revision";

export type ApprovalDecisionValue = "approved" | "rejected";

export type RecommendationBand = "strong_apply" | "review" | "weak" | "blocked";

export type RecommendationStatus = "pending" | "accepted" | "rejected" | "superseded";

export type TaskStatus = "pending" | "leased" | "succeeded" | "failed" | "cancelled";

export type TaskType =
  | "discover"
  | "assess"
  | "tailor_resume"
  | "cover_letter"
  | "package";

export type DocumentType = "resume" | "cover_letter";

export type ApplicationEventType =
  | "saved"
  | "package_ready"
  | "submitted"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "note";
