/**
 * Deterministic truth check for generated application documents.
 *
 * A generated claim may only survive if it is supported by evidence the user
 * actually owns: a verified candidate fact, or text present in the approved
 * source resume revision. Anything else is surfaced to the user and blocks
 * approval until it is evidenced or manually accepted.
 *
 * This module is pure (no I/O, no framework) so it can run in the browser,
 * in an edge function, and in tests.
 *
 * NOTE: an identical copy lives at src/lib/documents/truthCheck.ts (source of truth)
 * so the server can re-run the same check authoritatively. Keep them in sync.
 */

export type TruthCheckStatus =
  | "pending"
  | "passed"
  | "failed"
  | "needs_evidence"
  | "manually_approved";

export interface EvidenceFact {
  id: string;
  fact_text: string;
  verified: boolean;
}

export interface ClaimVerdict {
  claim: string;
  supported: boolean;
  /** ids of candidate_facts backing this claim */
  supporting_fact_ids: string[];
  /** why it failed, in plain English */
  reason?: string;
  severity: "ok" | "needs_evidence" | "fabricated";
}

export interface TruthCheckResult {
  status: TruthCheckStatus;
  claims: ClaimVerdict[];
  unsupported: ClaimVerdict[];
  supporting_fact_ids: string[];
  summary: string;
}

const STOP_WORDS = new Set([
  "a","an","the","and","or","of","to","in","for","with","on","at","by","from","as","is","are",
  "was","were","be","been","being","that","this","these","those","it","its","into","over","across",
  "using","used","use","led","i","my","me","we","our","their","his","her","them","also","than",
  "such","via","per","up","down","out","new","more","most","other","including","include","includes",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%.+#/\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Numbers, percentages, money and year spans — the classic fabrication vector. */
export function metricTokens(text: string): string[] {
  const matches = text.match(/\d+(?:[.,]\d+)?\s*(?:%|k\b|m\b|\+)?/gi) ?? [];
  return matches.map((m) => m.replace(/\s+/g, "").toLowerCase()).filter(Boolean);
}

/** Splits document content into individual reviewable claims. */
export function extractClaims(content: unknown): string[] {
  const out: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      value
        .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 12)
        .forEach((s) => out.push(s));
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  visit(content);
  return Array.from(new Set(out));
}

function corpusFrom(sourceText: string, facts: EvidenceFact[]): Set<string> {
  const corpus = new Set<string>();
  tokenize(sourceText).forEach((t) => corpus.add(t));
  facts.filter((f) => f.verified).forEach((f) => tokenize(f.fact_text).forEach((t) => corpus.add(t)));
  return corpus;
}

function metricCorpus(sourceText: string, facts: EvidenceFact[]): Set<string> {
  const corpus = new Set<string>();
  metricTokens(sourceText).forEach((t) => corpus.add(t));
  facts.filter((f) => f.verified).forEach((f) => metricTokens(f.fact_text).forEach((t) => corpus.add(t)));
  return corpus;
}

export interface TruthCheckInput {
  content: unknown;
  /** raw text of the approved source resume revision */
  sourceResumeText: string;
  facts: EvidenceFact[];
  /** fraction of a claim's tokens that must be evidenced (default 0.6) */
  threshold?: number;
}

export function runTruthCheck({
  content,
  sourceResumeText,
  facts,
  threshold = 0.6,
}: TruthCheckInput): TruthCheckResult {
  const claims = extractClaims(content);
  const verified = facts.filter((f) => f.verified);
  const words = corpusFrom(sourceResumeText, facts);
  const metrics = metricCorpus(sourceResumeText, facts);

  const verdicts: ClaimVerdict[] = claims.map((claim) => {
    const claimMetrics = metricTokens(claim);
    const fabricatedMetric = claimMetrics.find((m) => !metrics.has(m));
    if (fabricatedMetric) {
      return {
        claim,
        supported: false,
        supporting_fact_ids: [],
        severity: "fabricated",
        reason: `Contains the figure "${fabricatedMetric}", which does not appear in your master resume or any verified fact.`,
      };
    }

    const tokens = tokenize(claim);
    if (tokens.length === 0) {
      return { claim, supported: true, supporting_fact_ids: [], severity: "ok" };
    }
    const covered = tokens.filter((t) => words.has(t));
    const coverage = covered.length / tokens.length;

    const supportingFacts = verified
      .filter((f) => {
        const ft = new Set(tokenize(f.fact_text));
        const overlap = tokens.filter((t) => ft.has(t)).length;
        return overlap >= 2;
      })
      .map((f) => f.id);

    if (coverage >= threshold) {
      return { claim, supported: true, supporting_fact_ids: supportingFacts, severity: "ok" };
    }

    const missing = tokens.filter((t) => !words.has(t)).slice(0, 5).join(", ");
    return {
      claim,
      supported: false,
      supporting_fact_ids: supportingFacts,
      severity: "needs_evidence",
      reason: `No verified fact supports: ${missing || "this statement"}.`,
    };
  });

  const unsupported = verdicts.filter((v) => !v.supported);
  const status: TruthCheckStatus = unsupported.length === 0
    ? "passed"
    : unsupported.some((v) => v.severity === "fabricated")
      ? "failed"
      : "needs_evidence";

  const supporting = new Set<string>();
  verdicts.forEach((v) => v.supporting_fact_ids.forEach((id) => supporting.add(id)));

  return {
    status,
    claims: verdicts,
    unsupported,
    supporting_fact_ids: Array.from(supporting),
    summary:
      status === "passed"
        ? `All ${verdicts.length} claims are backed by your master resume or verified facts.`
        : `${unsupported.length} of ${verdicts.length} claims are not backed by verified evidence.`,
  };
}

/** Approval gate mirrored by the database. */
export function canApproveDocument(status: TruthCheckStatus): boolean {
  return status === "passed" || status === "manually_approved";
}

export function blockedReason(result: TruthCheckResult): string | null {
  if (canApproveDocument(result.status)) return null;
  const first = result.unsupported[0];
  return first
    ? `Approval blocked — ${first.reason ?? "unsupported claim"} ("${first.claim.slice(0, 120)}")`
    : "Approval blocked — truth check has not passed yet.";
}
