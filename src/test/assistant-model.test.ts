import { describe, expect, it } from "vitest";
import {
  applyRecommendationRejection,
  approvalKey,
  assertFreshRevision,
  assertOwnership,
  buildApplicationEvent,
  canMarkSubmitted,
  isDuplicateDecision,
  isOwnedBy,
  nextRevisionNumber,
} from "@/lib/assistant/model";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const JOB = "33333333-3333-3333-3333-333333333333";

describe("ownership", () => {
  it("accepts rows owned by the caller", () => {
    expect(isOwnedBy({ user_id: USER }, USER)).toBe(true);
    expect(assertOwnership({ user_id: USER }, USER).user_id).toBe(USER);
  });

  it("rejects rows owned by another user", () => {
    expect(isOwnedBy({ user_id: OTHER }, USER)).toBe(false);
    expect(() => assertOwnership({ user_id: OTHER }, USER)).toThrow(/not owned/);
  });

  it("rejects anonymous callers", () => {
    expect(() => assertOwnership({ user_id: USER }, "")).toThrow(/Authentication/);
  });
});

describe("approval idempotency", () => {
  const decision = {
    user_id: USER,
    entity_type: "document_revision",
    entity_id: "doc-1",
    decision: "approved",
    approved_hash: "hash-a",
  };

  it("produces a stable key", () => {
    expect(approvalKey(USER, "document_revision", "doc-1", "approved", "hash-a")).toBe(
      approvalKey(USER, "document_revision", "doc-1", "approved", "hash-a"),
    );
  });

  it("treats a repeated approval as a duplicate", () => {
    expect(isDuplicateDecision([decision], { ...decision })).toBe(true);
  });

  it("does not treat a different hash or decision as duplicate", () => {
    expect(isDuplicateDecision([decision], { ...decision, approved_hash: "hash-b" })).toBe(false);
    expect(isDuplicateDecision([decision], { ...decision, decision: "rejected" })).toBe(false);
    expect(isDuplicateDecision([decision], { ...decision, user_id: OTHER })).toBe(false);
  });
});

describe("stale revision rejection", () => {
  it("passes when hashes match", () => {
    expect(() => assertFreshRevision("hash-a", "hash-a")).not.toThrow();
  });

  it("throws when the entity changed since review", () => {
    expect(() => assertFreshRevision("hash-b", "hash-a")).toThrow(/Stale revision/);
  });
});

describe("immutable revisions", () => {
  it("increments instead of overwriting", () => {
    expect(nextRevisionNumber([])).toBe(1);
    expect(nextRevisionNumber([{ revision_number: 1 }, { revision_number: 3 }])).toBe(4);
  });
});

describe("recommendation rejection", () => {
  it("only mutates the targeted recommendation", () => {
    const before = [
      { id: "a", status: "pending" },
      { id: "b", status: "accepted" },
    ];
    const after = applyRecommendationRejection(before, "a");
    expect(after[0].status).toBe("rejected");
    expect(after[1]).toEqual({ id: "b", status: "accepted" });
    expect(before[0].status).toBe("pending");
  });
});

describe("application events", () => {
  it("requires an explicit submission event before marking submitted", () => {
    expect(canMarkSubmitted([], JOB)).toBe(false);
    expect(canMarkSubmitted([{ job_id: JOB, event_type: "saved" }], JOB)).toBe(false);
    expect(canMarkSubmitted([{ job_id: JOB, event_type: "submitted" }], JOB)).toBe(true);
  });

  it("builds an owned, timestamped event", () => {
    const event = buildApplicationEvent({
      userId: USER,
      jobId: JOB,
      eventType: "submitted",
      source: "manual",
      externalReference: "SEEK-123",
      eventAt: new Date("2026-08-22T00:00:00.000Z"),
    });
    expect(event).toMatchObject({
      user_id: USER,
      job_id: JOB,
      event_type: "submitted",
      source: "manual",
      external_reference: "SEEK-123",
      event_at: "2026-08-22T00:00:00.000Z",
    });
  });

  it("refuses to build events without an owner or job", () => {
    expect(() => buildApplicationEvent({ userId: "", jobId: JOB, eventType: "note" })).toThrow();
    expect(() => buildApplicationEvent({ userId: USER, jobId: "", eventType: "note" })).toThrow();
  });
});
