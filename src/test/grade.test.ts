import { describe, expect, it } from "vitest";
import { gradeForScore, whyApply } from "@/lib/grade";

describe("job-agent grade policy", () => {
  const policy = { policy_strong: 80, policy_review: 60 };
  it("maps scores to A/B/C/D", () => {
    expect([80, 60, 45, 39].map((score) => gradeForScore(score, policy))).toEqual(["A", "B", "C", "D"]);
  });
  it("never lowers the C threshold below 40", () => {
    expect(gradeForScore(40, { policy_strong: 70, policy_review: 45 })).toBe("C");
    expect(gradeForScore(39, { policy_strong: 70, policy_review: 45 })).toBe("D");
  });
  it("uses strategic advice for why-apply", () => {
    expect(whyApply({ strategic_advice: "Apply", reasoning: "Fit" })).toBe("Apply");
  });
});
