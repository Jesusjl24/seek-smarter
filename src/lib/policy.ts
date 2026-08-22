// Single source of truth for turning a match score into a recommendation band.
// Mirrored (intentionally duplicated, Deno cannot import from src/) in
// supabase/functions/_shared/policy.ts — keep both in sync.

import { DEFAULT_POLICY, type ScorePolicy } from "@/types/preferences";

export type ScoreBand = "strong_apply" | "review" | "deprioritise";

export const BAND_LABELS: Record<ScoreBand, string> = {
  strong_apply: "Strong Apply",
  review: "Review",
  deprioritise: "Deprioritise",
};

export function isValidPolicy(policy: Partial<ScorePolicy> | null | undefined): boolean {
  if (!policy) return false;
  const { policy_strong: strong, policy_review: review } = policy;
  if (typeof strong !== "number" || typeof review !== "number") return false;
  if (!Number.isInteger(strong) || !Number.isInteger(review)) return false;
  return review >= 0 && review < strong && strong <= 100;
}

/** Falls back to the 80/75 defaults when the supplied policy is missing or invalid. */
export function resolvePolicy(policy?: Partial<ScorePolicy> | null): ScorePolicy {
  return isValidPolicy(policy)
    ? { policy_strong: policy!.policy_strong!, policy_review: policy!.policy_review! }
    : { ...DEFAULT_POLICY };
}

export function classifyScore(
  score: number,
  policy?: Partial<ScorePolicy> | null
): ScoreBand {
  const { policy_strong, policy_review } = resolvePolicy(policy);
  const s = Number.isFinite(score) ? score : 0;
  if (s >= policy_strong) return "strong_apply";
  if (s >= policy_review) return "review";
  return "deprioritise";
}

export function bandLabel(score: number, policy?: Partial<ScorePolicy> | null): string {
  return BAND_LABELS[classifyScore(score, policy)];
}
