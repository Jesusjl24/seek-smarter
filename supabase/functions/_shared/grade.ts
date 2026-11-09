export type MatchGrade = "A" | "B" | "C" | "D";

export interface GradePolicy {
  policy_strong: number;
  policy_review: number;
}

export function gradeForScore(score: number, policy: GradePolicy): MatchGrade {
  if (score >= policy.policy_strong) return "A";
  if (score >= policy.policy_review) return "B";
  if (score >= Math.max(40, policy.policy_review - 15)) return "C";
  return "D";
}

export function whyApply(result: { strategic_advice?: unknown; reasoning?: unknown }): string {
  const advice = typeof result.strategic_advice === "string" ? result.strategic_advice.trim() : "";
  const reasoning = typeof result.reasoning === "string" ? result.reasoning.trim() : "";
  return advice || reasoning;
}
