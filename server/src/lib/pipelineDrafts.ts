import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Config } from "../config.js";
import { canonicalJson, coverLetter, sha256, tailorResume, type DraftPreferences, type DraftProfile } from "./tailorDrafts.js";

type DraftableJob = { id: string; grade: string; match_score: number; title: string; company: string; location: string; description_snippet: string; full_description?: string | null; updated_at?: string };
type ResumeGenerator = (config: Config, job: any, profile: DraftProfile, score: number, prefs?: DraftPreferences) => Promise<any>;
type CoverGenerator = (config: Config, job: any, profile: DraftProfile, score: number, highlights?: string[], prefs?: DraftPreferences) => Promise<any>;
type GeneratorOptions = { limit?: number; generateResume?: ResumeGenerator; generateCover?: CoverGenerator };
export type DraftResult = { jobs_drafted: number; skipped: string[]; errors: string[] };

function recordTask(db: Database.Database, userId: string, jobId: string, taskType: "tailor_resume" | "cover_letter", status: "pending" | "succeeded", message?: string) {
  const key = `pipeline:${jobId}:${taskType}`;
  const duplicate = db.prepare("SELECT id FROM assistant_tasks WHERE user_id=? AND task_type=? AND status IN ('pending','succeeded') AND json_extract(payload,'$.idempotency_key')=? LIMIT 1").get(userId, taskType, key);
  if (duplicate) return;
  const timestamp = new Date().toISOString();
  const payload = JSON.stringify({ job_id: jobId, idempotency_key: key, ...(message ? { error: message } : {}) });
  db.prepare("INSERT INTO assistant_tasks(id,user_id,task_type,status,payload,result,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(), userId, taskType, status, payload, JSON.stringify(message ? { error: message } : { drafted: true }), timestamp, timestamp);
}

function persistDraft(db: Database.Database, userId: string, jobId: string, type: "resume" | "cover_letter", artifactType: "tailored_resume" | "cover_letter", content: unknown, sourceId: string | null) {
  const previous = db.prepare("SELECT id,revision_number FROM document_revisions WHERE user_id=? AND job_id=? AND document_type=? ORDER BY revision_number DESC LIMIT 1").get(userId, jobId, type) as any;
  const timestamp = new Date().toISOString(), serialized = canonicalJson(content);
  db.transaction(() => {
    db.prepare("INSERT INTO document_revisions(id,user_id,job_id,document_type,revision_number,content,content_hash,truth_check_status,approval_status,source_resume_revision_id,supersedes_revision_id,agent_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), userId, jobId, type, (previous?.revision_number || 0) + 1, serialized, sha256(serialized), "pending", "pending", sourceId, previous?.id || null, "job-pipeline", timestamp, timestamp);
    db.prepare("INSERT INTO job_artifacts(id,user_id,job_id,artifact_type,content,agent,version,created_at) VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(), userId, jobId, artifactType, serialized, "job-pipeline", "1.0", timestamp);
  })();
}

export async function draftAGradePackages(db: Database.Database, config: Config, userId: string, jobs: DraftableJob[], opts: GeneratorOptions = {}): Promise<DraftResult> {
  const result: DraftResult = { jobs_drafted: 0, skipped: [], errors: [] }, limit = Math.min(opts.limit ?? 3, 3);
  if (limit <= 0) return result;
  if (!config.openaiApiKey && !config.geminiApiKey) { result.skipped.push(`Drafting skipped: ${config.aiProvider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} is not configured`); return result; }
  const profile = db.prepare("SELECT * FROM resume_profile WHERE user_id=? AND trim(raw_text)<>'' LIMIT 1").get(userId) as DraftProfile | undefined;
  const approved = db.prepare("SELECT id,raw_text FROM resume_revisions WHERE user_id=? AND approved_at IS NOT NULL ORDER BY revision_number DESC LIMIT 1").get(userId) as any;
  const draftProfile: DraftProfile | undefined = profile || (approved ? { raw_text: approved.raw_text } : undefined);
  if (!draftProfile) { result.skipped.push("Drafting skipped: no resume profile with raw text or approved master resume revision"); return result; }
  const prefs = db.prepare("SELECT * FROM candidate_preferences WHERE user_id=?").get(userId) as DraftPreferences;
  const generateResume = opts.generateResume || tailorResume, generateCover = opts.generateCover || coverLetter;
  for (const job of jobs.filter((item) => item.grade === "A").slice(0, limit)) {
    const revisions = db.prepare("SELECT document_type FROM document_revisions WHERE user_id=? AND job_id=? AND approval_status IN ('pending','approved')").all(userId, job.id) as any[];
    const artifacts = db.prepare("SELECT artifact_type FROM job_artifacts WHERE user_id=? AND job_id=?").all(userId, job.id) as any[];
    const blocked = new Set([...revisions.map((row) => row.document_type), ...artifacts.map((row) => row.artifact_type === "tailored_resume" ? "resume" : row.artifact_type)]);
    let persisted = false, resumeContent: any;
    if (!blocked.has("resume")) try { resumeContent = await generateResume(config, job, draftProfile, job.match_score, prefs); persistDraft(db, userId, job.id, "resume", "tailored_resume", resumeContent, approved?.id || null); recordTask(db, userId, job.id, "tailor_resume", "succeeded"); persisted = true; } catch (error) { const message = error instanceof Error ? error.message : String(error); result.errors.push(`${job.id} resume: ${message}`); recordTask(db, userId, job.id, "tailor_resume", "pending", message); }
    else result.skipped.push(`${job.id} resume skipped: an active revision or artifact already exists`);
    if (!blocked.has("cover_letter")) try { const highlights = Array.isArray(resumeContent?.skills_to_emphasize) ? resumeContent.skills_to_emphasize : []; const content = await generateCover(config, job, draftProfile, job.match_score, highlights, prefs); persistDraft(db, userId, job.id, "cover_letter", "cover_letter", content, approved?.id || null); recordTask(db, userId, job.id, "cover_letter", "succeeded"); persisted = true; } catch (error) { const message = error instanceof Error ? error.message : String(error); result.errors.push(`${job.id} cover letter: ${message}`); recordTask(db, userId, job.id, "cover_letter", "pending", message); }
    else result.skipped.push(`${job.id} cover letter skipped: an active revision or artifact already exists`);
    if (persisted) result.jobs_drafted++;
  }
  return result;
}
