/**
 * Pure helpers for the Job Assistant durable data model.
 * These mirror the invariants enforced by the database (RLS, immutable
 * revisions, idempotent approvals) so the client can fail fast before a
 * round trip.
 */
import type {
  ApplicationEventInsert,
  ApplicationEventType,
  ApprovalDecisionValue,
  ApprovalEntityType,
} from "@/types/assistant";

export interface OwnedRow {
  user_id: string;
}

/** Ownership guard: never operate on a row that does not belong to the caller. */
export function assertOwnership<T extends OwnedRow>(row: T, userId: string): T {
  if (!userId) throw new Error("Authentication required");
  if (row.user_id !== userId) throw new Error("Row is not owned by caller");
  return row;
}

export function isOwnedBy(row: OwnedRow | null | undefined, userId: string): boolean {
  return !!row && !!userId && row.user_id === userId;
}

/** Stable key used to make approvals idempotent. */
export function approvalKey(
  userId: string,
  entityType: ApprovalEntityType,
  entityId: string,
  decision: ApprovalDecisionValue,
  approvedHash: string,
): string {
  return [userId, entityType, entityId, decision, approvedHash].join(":");
}

export interface ExistingDecision {
  user_id: string;
  entity_type: string;
  entity_id: string;
  decision: string;
  approved_hash: string | null;
}

/**
 * Returns true when the same decision on the same content already exists,
 * meaning the write should be skipped (idempotent approval).
 */
export function isDuplicateDecision(
  existing: ExistingDecision[],
  candidate: ExistingDecision,
): boolean {
  return existing.some(
    (d) =>
      d.user_id === candidate.user_id &&
      d.entity_type === candidate.entity_type &&
      d.entity_id === candidate.entity_id &&
      d.decision === candidate.decision &&
      (d.approved_hash ?? null) === (candidate.approved_hash ?? null),
  );
}

/** Reject approvals raised against a revision that has since changed. */
export function assertFreshRevision(currentHash: string, reviewedHash: string): void {
  if (!currentHash) throw new Error("Entity not found");
  if (currentHash !== reviewedHash) {
    throw new Error("Stale revision: entity changed since it was reviewed");
  }
}

/** Immutable revisions: the next revision always increments, never overwrites. */
export function nextRevisionNumber(existing: { revision_number: number }[]): number {
  return existing.reduce((max, r) => Math.max(max, r.revision_number), 0) + 1;
}

/**
 * Rejecting a recommendation only flips that recommendation's status.
 * No job, package or document state is touched.
 */
export function applyRecommendationRejection<T extends { id: string; status: string }>(
  recommendations: T[],
  recommendationId: string,
): T[] {
  return recommendations.map((r) =>
    r.id === recommendationId ? { ...r, status: "rejected" } : r,
  );
}

/**
 * A job is only "submitted" when an explicit submission event exists.
 * A pipeline dropdown change alone is not evidence of submission.
 */
export function canMarkSubmitted(
  events: { job_id: string; event_type: ApplicationEventType }[],
  jobId: string,
): boolean {
  return events.some((e) => e.job_id === jobId && e.event_type === "submitted");
}

export function buildApplicationEvent(input: {
  userId: string;
  jobId: string;
  eventType: ApplicationEventType;
  source?: "manual" | "assistant" | "import";
  externalReference?: string | null;
  notes?: string | null;
  eventAt?: Date;
}): ApplicationEventInsert {
  if (!input.userId) throw new Error("Authentication required");
  if (!input.jobId) throw new Error("jobId is required");
  return {
    user_id: input.userId,
    job_id: input.jobId,
    event_type: input.eventType,
    source: input.source ?? "manual",
    external_reference: input.externalReference ?? null,
    notes: input.notes ?? null,
    event_at: (input.eventAt ?? new Date()).toISOString(),
  };
}
