import { describe, expect, it } from "vitest";
import { buildAssistantSnapshot } from "@/lib/api/assistant";

describe("assistant snapshot incoming roles", () => {
  it("includes only graded inbox/shortlist roles and sorts by score", () => {
    const base = { company: "Acme", location: "Sydney", salary_range: null, work_type: null, work_arrangement: null, description_snippet: "Role", full_description: null, job_url: "https://example.test", date_posted: null, date_scraped: "2026-11-10T00:00:00Z", notes: null, updated_at: "2026-11-10T00:00:00Z", seek_job_id: "1" };
    const match = (score: number, grade: "A" | "B", why: string) => ({ id: crypto.randomUUID(), job_id: "", resume_profile_id: "r", match_score: score, skill_match_percentage: score, recommendation: "Apply", reasoning: "Reason", pros: [], cons: [], gaps: [], strategic_advice: null, scored_at: "2026-11-10T00:00:00Z", grade, why_apply: why });
    const jobs = [
      { ...base, id: "lower", title: "Engineer", pipeline_status: "inbox", match: match(72, "B", "Good trajectory") },
      { ...base, id: "higher", seek_job_id: "2", title: "Lead", pipeline_status: "shortlist", match: match(91, "A", "Excellent fit") },
      { ...base, id: "hidden", seek_job_id: "3", title: "Hidden", pipeline_status: "not_fit", match: match(95, "A", "Hidden") },
    ];
    const snapshot = buildAssistantSnapshot({ jobs: jobs as never, artifacts: [], policy: { policy_strong: 80, policy_review: 60 }, hasResume: true });
    expect(snapshot.incoming.map((job) => job.job_id)).toEqual(["higher", "lower"]);
    expect(snapshot.incoming[0]).toMatchObject({ grade: "A", why_apply: "Excellent fit", score: 91 });
  });
});
