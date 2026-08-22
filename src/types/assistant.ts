import type { Tables, TablesInsert } from "@/integrations/supabase/types";

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
