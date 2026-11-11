import { parseSalaryFloor } from "./dealbreakers.js";

export type SkepticReview = {
  decision: "confirmed" | "flagged";
  reason: string;
  flags: string[];
  chance_estimate?: string | null;
};

const JUNIOR = /\b(junior|graduate|intern|entry[-\s]?level|coordinator|assistant)\b/i;

export function reviewGrade(job: any, match: any, prefs: any): SkepticReview {
  const flags: string[] = [];
  const salary = parseSalaryFloor(job.salary_range);
  const grade = String(match?.grade || "");
  if ((grade === "A" || grade === "B") && salary != null && prefs?.salary_min && salary < Number(prefs.salary_min)) {
    flags.push(`The ${grade}-grade looks generous: the listed salary ${job.salary_range} is below your floor.`);
  }
  if (JUNIOR.test(String(job.title || "")) && (grade === "A" || grade === "B")) {
    flags.push(`The title “${job.title}” reads more junior than a senior or lead brief.`);
  }
  if (!String(match?.risks || "").trim() && grade === "A") {
    flags.push("This was marked a top pick, but no key risk was noted.");
  }
  const chance = match?.chance_estimate || null;
  if (flags.length) return { decision: "flagged", reason: flags.join(" "), flags, chance_estimate: chance };
  return {
    decision: "confirmed",
    reason: grade ? `The ${grade}-grade is consistent with the listing details we can check (salary, title, and stated risks).` : "No grade to check.",
    flags,
    chance_estimate: chance,
  };
}
