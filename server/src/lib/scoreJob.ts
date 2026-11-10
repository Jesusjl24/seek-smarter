import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { chatJson } from "../ai.js";
import type { Config } from "../config.js";
import { gradeForScore } from "./grade.js";
export async function scoreJob(db: Database.Database, config: Config, userId: string, jobId: string) {
  const job = db.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").get(jobId, userId) as any;
  const resume = db.prepare("SELECT * FROM resume_profile WHERE user_id=?").get(userId) as any;
  if (!job) throw new Error("Job not found"); if (!resume) throw new Error("Upload a resume before scoring jobs");
  const result: any = await chatJson(config, { system: "Score this job against the resume. Return JSON with match_score (0-100), recommendation, reasoning, pros, cons, gaps, why_apply, risks.", user: JSON.stringify({ job, resume }) });
  const score = Math.max(0, Math.min(100, Number(result.match_score) || 0)); const now = new Date().toISOString();
  const row = { id: randomUUID(), user_id: userId, job_id: jobId, resume_profile_id: resume.id, match_score: score, skill_match_percentage: result.skill_match_percentage ?? score, recommendation: result.recommendation || "review", reasoning: result.reasoning || null, pros: JSON.stringify(result.pros || []), cons: JSON.stringify(result.cons || []), gaps: JSON.stringify(result.gaps || []), strategic_advice: result.strategic_advice || null, scored_at: now, grade: gradeForScore(score, { policy_strong: 80, policy_review: 75 }), why_apply: result.why_apply || null, risks: result.risks || null, agent: "score_job", agent_version: "1.0", veto_reasons: "[]", scores: JSON.stringify(result.scores || null), dealbreaker_hits: "[]", concerns: JSON.stringify(result.concerns || []) };
  db.prepare(`INSERT INTO job_matches (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")}) ON CONFLICT(user_id,job_id,resume_profile_id) DO UPDATE SET match_score=excluded.match_score,recommendation=excluded.recommendation,reasoning=excluded.reasoning,pros=excluded.pros,cons=excluded.cons,gaps=excluded.gaps,scored_at=excluded.scored_at,grade=excluded.grade,why_apply=excluded.why_apply,risks=excluded.risks`).run(...Object.values(row));
  return db.prepare("SELECT * FROM job_matches WHERE user_id=? AND job_id=?").get(userId, jobId);
}
