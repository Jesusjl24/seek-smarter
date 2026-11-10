import { createHash } from "node:crypto";
import { chatJson } from "../ai.js";
import type { Config } from "../config.js";

export type DraftJob = { title: string; company: string; location: string; description_snippet: string; full_description?: string | null };
export type DraftProfile = { raw_text?: string | null; skills_technical?: string[] | string; skills_soft?: string[] | string; years_experience?: number | null; education?: string[] | string; certifications?: string[] | string; previous_titles?: string[] | string; industries?: string[] | string; summary?: string | null };
export type DraftPreferences = { job_goals?: string | null; career_direction?: string | null; target_titles?: string[] | string; verified_experience?: string | null } | null;

const list = (value: string[] | string | undefined) => Array.isArray(value) ? value : (() => { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return value ? [value] : []; } })();
const prefsText = (prefs: DraftPreferences) => prefs ? `CANDIDATE CONSTRAINTS AND GOALS (respect these; never contradict them):\n- Job goals: ${prefs.job_goals || "Not specified"}\n- Career direction: ${prefs.career_direction || "Not specified"}\n- Target titles: ${list(prefs.target_titles).join(", ") || "Not specified"}\n- Verified experience (the ONLY claims you may present as proven): ${prefs.verified_experience || "Not specified"}\n- Never invent experience, employers, metrics, or qualifications beyond the resume and verified experience above.` : "CANDIDATE CONSTRAINTS: none saved. Use only what the resume states; invent nothing.";
const profileText = (p: DraftProfile) => p.raw_text || `Technical Skills: ${list(p.skills_technical).join(", ") || "None specified"}\nSoft Skills: ${list(p.skills_soft).join(", ") || "None specified"}\nYears of Experience: ${p.years_experience ?? "Not specified"}\nEducation: ${list(p.education).join(", ") || "None specified"}\nCertifications: ${list(p.certifications).join(", ") || "None"}\nPrevious Roles: ${list(p.previous_titles).join(", ") || "None specified"}\nIndustries: ${list(p.industries).join(", ") || "Not specified"}\nSummary: ${p.summary || "Not provided"}`;

export async function tailorResume(config: Config, job: DraftJob, profile: DraftProfile, score: number, prefs: DraftPreferences = null) {
  if (score < 60) throw new Error("Resume tailoring requires a match score of 60 or higher");
  const result: any = await chatJson(config, { system: "You are an expert resume consultant specialising in ATS optimisation and recruiter psychology. Provide truthful, copy-paste-ready suggestions. Never invent experience, skills, employers, metrics, achievements, or qualifications. Only rephrase, reorder, and emphasise supplied evidence. Output JSON only.", user: `${prefsText(prefs)}\n\nGenerate tailored resume suggestions.\n\nCANDIDATE'S CURRENT RESUME/PROFILE:\n${profileText(profile)}\n\nTARGET JOB:\n- Title: ${job.title}\n- Company: ${job.company}\n- Location: ${job.location}\n- Description: ${job.full_description || job.description_snippet}\n\nReturn JSON with: keywords_to_inject (array), skills_to_emphasize (array), summary_rewrite (string), bullet_rewrites (3-5 objects with section,before,after,why), gap_mitigation (1-3 objects with gap,workaround), final_notes (string).`, temperature: 0.4 });
  return { agent_meta: { agent: "resume_tailor", version: "1.0" }, target_role: { title: job.title, company: job.company }, keywords_to_inject: Array.isArray(result.keywords_to_inject) ? result.keywords_to_inject : [], skills_to_emphasize: Array.isArray(result.skills_to_emphasize) ? result.skills_to_emphasize : [], summary_rewrite: result.summary_rewrite || "", bullet_rewrites: Array.isArray(result.bullet_rewrites) ? result.bullet_rewrites : [], gap_mitigation: Array.isArray(result.gap_mitigation) ? result.gap_mitigation : [], final_notes: result.final_notes || "" };
}

export async function coverLetter(config: Config, job: DraftJob, profile: DraftProfile, score: number, highlights: string[] = [], prefs: DraftPreferences = null) {
  if (score < 60) throw new Error("Cover letter generation requires a match score of 60 or higher");
  const emphasis = highlights.length ? `\nKEY HIGHLIGHTS TO EMPHASISE:\n${highlights.map((item) => `- ${item}`).join("\n")}` : "";
  const result: any = await chatJson(config, { system: "You are an expert career consultant specialising in Australian professional cover letters. Use Australian English, be concise and direct, and never fabricate claims or experience. Address specific job requirements. Output JSON only.", user: `${prefsText(prefs)}\n\nWrite a professional Australian-style 250-350 word cover letter.\n\nCANDIDATE PROFILE:\n${profileText(profile)}${emphasis}\n\nTARGET JOB:\n- Title: ${job.title}\n- Company: ${job.company}\n- Location: ${job.location}\n- Description: ${job.full_description || job.description_snippet}\n\nReturn JSON with: cover_letter (paragraphs separated by \\n\\n), key_points_used (array), suggested_subject_lines (array), final_checklist (array).`, temperature: 0.5 });
  return { agent_meta: { agent: "cover_letter_writer", version: "1.0" }, target_role: { title: job.title, company: job.company }, cover_letter: result.cover_letter || "", key_points_used: Array.isArray(result.key_points_used) ? result.key_points_used : [], suggested_subject_lines: Array.isArray(result.suggested_subject_lines) ? result.suggested_subject_lines : [], final_checklist: Array.isArray(result.final_checklist) ? result.final_checklist : ["Tailored to role", "Matches job language", "No fabricated claims"] };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
