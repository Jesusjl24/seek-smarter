import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { chatJson } from "../ai.js";
import type { Config } from "../config.js";
import { gradeForScore } from "./grade.js";
import { deterministicFilter, parseSalaryFloor } from "./dealbreakers.js";
import { decodeRow } from "../db.js";
import { aggregatePreferences, learnedPreferenceAdjustment, preferencePromptPayload } from "./preferences.js";

const CRITERIA = ["role_fit", "seniority", "salary", "location", "skills", "learned_preferences"] as const;
const CRITERIA_LABELS: Record<string, string> = {
  role_fit: "Role fit",
  seniority: "Seniority",
  salary: "Salary vs $150,000–$180,000 target",
  location: "Location and work mode",
  skills: "Skills overlap",
  learned_preferences: "Learned preferences",
};

function asText(value: unknown, fallback: string | null = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("; ") || fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function quotes(value: unknown): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => typeof item === "string" ? item.trim() : asText(item, "") || "").filter((item) => item.length > 0).slice(0, 6);
}

export function normalizeCriteria(raw: any) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out: Record<string, { label: string; score: number | null; note: string | null; evidence: string | null }> = {};
  for (const key of CRITERIA) {
    const item = source[key] || source[key.replace("_", "")] || {};
    const evidence = typeof item.evidence === "string" ? item.evidence : Array.isArray(item.evidence) ? item.evidence[0] : null;
    out[key] = {
      label: CRITERIA_LABELS[key],
      score: item.score == null || item.score === "" ? null : Math.max(0, Math.min(100, Number(item.score) || 0)),
      note: asText(item.note || item.reasoning || item.summary, null),
      evidence: asText(evidence, null),
    };
  }
  return out;
}

export function normalizeEvidence(result: any, resume: any, job: any) {
  const ev = result?.evidence && typeof result.evidence === "object" ? result.evidence : {};
  const resumeQuotes = quotes(ev.resume_quotes || ev.resume || ev.resume_lines);
  const jobQuotes = quotes(ev.job_quotes || ev.job || ev.listing_quotes);
  const items: { kind: string; text: string }[] = [];
  for (const text of resumeQuotes) items.push({ kind: "resume", text });
  for (const text of jobQuotes) items.push({ kind: "job", text });
  const criteria = normalizeCriteria(result?.criteria);
  for (const [key, item] of Object.entries(criteria)) {
    if (item.evidence) items.push({ kind: key, text: item.evidence });
  }
  if (!items.length && job?.salary_range) items.push({ kind: "salary", text: String(job.salary_range) });
  if (!items.length && resume?.summary) items.push({ kind: "resume", text: String(resume.summary).slice(0, 280) });
  return { items, resume_quotes: resumeQuotes, job_quotes: jobQuotes };
}

export async function scoreJob(db: Database.Database, config: Config, userId: string, jobId: string) {
  const job = db.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").get(jobId, userId) as any;
  const resume = db.prepare("SELECT * FROM resume_profile WHERE user_id=?").get(userId) as any;
  const prefs = decodeRow(db.prepare("SELECT * FROM candidate_preferences WHERE user_id=?").get(userId)) as any;
  const feedback = db.prepare("SELECT reason FROM job_feedback WHERE user_id=? AND action='not_for_me' AND reason IS NOT NULL ORDER BY created_at DESC LIMIT 10").all(userId) as any[];
  if (!job) throw new Error("Job not found"); if (!resume) throw new Error("Upload a resume before scoring jobs");
  const dealbreaker = deterministicFilter(job, prefs);
  const learned = preferencePromptPayload(db, userId);
  const aggregates = aggregatePreferences(db, userId);
  const prefAdj = learnedPreferenceAdjustment(job, aggregates);
  const result: any = await chatJson(config, {
    system: "Score this job against the resume and candidate preferences. Senior/lead scope matters: penalise junior and mid-level roles. Return JSON only with match_score (0-100), recommendation, reasoning, pros, cons, gaps, why_apply (2-3 concise sentences), risks, chance_estimate (short plain English), criteria, and evidence. criteria must include role_fit, seniority, salary, location, and skills; each has score (0-100), note (one sentence), and evidence (a short verbatim quote or fact). For salary, compare against the candidate's target band (AUD 150,000–180,000 when stated) and their salary floor. If learned_preferences_memo or recent likes/dislikes are provided, weigh them and stay consistent with what the person has already told you they like or avoid. evidence is { resume_quotes: string[], job_quotes: string[] }. Never invent quotes or experience. If you cannot find a quote, omit it.",
    user: JSON.stringify({ job, resume, preferences: prefs, recent_not_for_me_reasons: feedback.map((item) => item.reason), ...learned }),
  });
  let score = Math.max(0, Math.min(100, Number(result.match_score) || 0));
  const salary = parseSalaryFloor(job.salary_range); if (salary && prefs?.salary_min && salary < prefs.salary_min * 1.1) score = Math.max(0, score - 8);
  if (prefAdj.delta) score = Math.max(0, Math.min(100, score + prefAdj.delta));
  const now = new Date().toISOString();
  const asJson = (value: unknown, fallback: unknown) => JSON.stringify(value ?? fallback);
  const grade = gradeForScore(score, { policy_strong: prefs?.policy_strong ?? 80, policy_review: prefs?.policy_review ?? 75 });
  const criteria = normalizeCriteria(result.criteria);
  if (prefAdj.note || prefAdj.evidence || prefAdj.delta) {
    criteria.learned_preferences = {
      label: "Learned preferences",
      score: prefAdj.score,
      note: prefAdj.note,
      evidence: prefAdj.evidence,
    };
  } else {
    delete criteria.learned_preferences;
  }
  const evidence = normalizeEvidence(result, resume, job);
  const row = { id: randomUUID(), user_id: userId, job_id: jobId, resume_profile_id: resume.id, match_score: score, skill_match_percentage: Number(result.skill_match_percentage) || score, recommendation: asText(result.recommendation, "review"), reasoning: asText(result.reasoning), pros: asJson(result.pros, []), cons: asJson(result.cons, []), gaps: asJson(result.gaps, []), strategic_advice: asText(result.strategic_advice), scored_at: now, grade, why_apply: asText(result.why_apply), risks: asText(result.risks), chance_estimate: asText(result.chance_estimate, "Unknown"), agent: "score_job", agent_version: "1.2", veto_reasons: asJson(result.veto_reasons, []), scores: asJson(result.scores, null), dealbreaker_hits: asJson([...dealbreaker.hits, ...(result.dealbreaker_hits || [])], []), concerns: asJson(result.concerns, []), evidence_json: asJson(evidence, {}), criteria_json: asJson(criteria, {}) };
  db.prepare(`INSERT INTO job_matches (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")}) ON CONFLICT(user_id,job_id,resume_profile_id) DO UPDATE SET match_score=excluded.match_score,recommendation=excluded.recommendation,reasoning=excluded.reasoning,pros=excluded.pros,cons=excluded.cons,gaps=excluded.gaps,scored_at=excluded.scored_at,grade=excluded.grade,why_apply=excluded.why_apply,risks=excluded.risks,chance_estimate=excluded.chance_estimate,dealbreaker_hits=excluded.dealbreaker_hits,evidence_json=excluded.evidence_json,criteria_json=excluded.criteria_json`).run(...Object.values(row));
  const reason = dealbreaker.reason || (grade === "D" || score < (prefs?.policy_review ?? 75) ? "weak_fit" : null);
  if (reason) db.prepare("UPDATE jobs SET pipeline_status='not_fit',triage_source='auto',auto_hidden_at=?,filter_reason=?,updated_at=? WHERE id=? AND user_id=?").run(now, reason, now, jobId, userId);
  return db.prepare("SELECT * FROM job_matches WHERE user_id=? AND job_id=?").get(userId, jobId);
}
