import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { gradeForScore, whyApply } from "./grade.ts";

const policy = { policy_strong: 80, policy_review: 60 };

Deno.test("gradeForScore maps policy bands and the C floor", () => {
  assertEquals([80, 60, 45, 39].map((score) => gradeForScore(score, policy)), ["A", "B", "C", "D"]);
  assertEquals(gradeForScore(40, { policy_strong: 70, policy_review: 45 }), "C");
});

Deno.test("whyApply prefers strategic advice and falls back to reasoning", () => {
  assertEquals(whyApply({ strategic_advice: " Apply now ", reasoning: "Fit" }), "Apply now");
  assertEquals(whyApply({ strategic_advice: "", reasoning: " Strong fit " }), "Strong fit");
});
