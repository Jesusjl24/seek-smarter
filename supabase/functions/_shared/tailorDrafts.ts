export type DraftJob = { title: string; company: string; location: string; description_snippet: string; full_description?: string | null };
export type DraftProfile = { raw_text?: string | null; skills_technical?: string[]; skills_soft?: string[]; years_experience?: number | null; education?: string[]; certifications?: string[]; previous_titles?: string[]; industries?: string[]; summary?: string | null };
export type DraftPreferences = { job_goals?: string | null; career_direction?: string | null; target_titles?: string[]; verified_experience?: string | null } | null;

const MODEL = "google/gemini-3-flash-preview";
export class DraftGenerationError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const prefsText = (prefs: DraftPreferences) => prefs ? `CANDIDATE CONSTRAINTS AND GOALS (respect these; never contradict them):\n- Job goals: ${prefs.job_goals || "Not specified"}\n- Career direction: ${prefs.career_direction || "Not specified"}\n- Target titles: ${(prefs.target_titles ?? []).join(", ") || "Not specified"}\n- Verified experience (the ONLY claims you may present as proven): ${prefs.verified_experience || "Not specified"}\n- Never invent experience, employers, metrics, or qualifications beyond the resume and verified experience above.` : "CANDIDATE CONSTRAINTS: none saved. Use only what the resume states; invent nothing.";
const profileText = (p: DraftProfile) => p.raw_text || `Technical Skills: ${(p.skills_technical ?? []).join(", ") || "None specified"}\nSoft Skills: ${(p.skills_soft ?? []).join(", ") || "None specified"}\nYears of Experience: ${p.years_experience ?? "Not specified"}\nEducation: ${(p.education ?? []).join(", ") || "None specified"}\nCertifications: ${(p.certifications ?? []).join(", ") || "None"}\nPrevious Roles: ${(p.previous_titles ?? []).join(", ") || "None specified"}\nIndustries: ${(p.industries ?? []).join(", ") || "Not specified"}\nSummary: ${p.summary || "Not provided"}`;

async function complete(apiKey: string, system: string, prompt: string, temperature: number): Promise<Record<string, unknown>> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], temperature }) });
  if (!response.ok) throw new DraftGenerationError(response.status === 429 ? "Rate limit exceeded. Please try again in a moment." : response.status === 402 ? "AI credits exhausted. Please add credits to continue." : `Lovable AI draft failed (${response.status})`, response.status);
  const payload = await response.json();
  const raw = String(payload.choices?.[0]?.message?.content ?? "").replace(/```json\n?|\n?```/g, "").trim();
  if (!raw) throw new Error("No response from AI");
  try { return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw); } catch { throw new Error("Failed to parse draft data"); }
}

export async function generateTailoredResumeDraft(args: { job: DraftJob; profile: DraftProfile; prefs: DraftPreferences; matchScore: number; apiKey: string }) {
  if (args.matchScore < 60) throw new Error("Resume tailoring requires a match score of 60 or higher");
  const system = "You are an expert resume consultant specialising in ATS optimisation and recruiter psychology. Provide TRUTHFUL, copy-paste-ready suggestions. NEVER invent experience, skills, employers, metrics, achievements, or qualifications. Only rephrase, reorder, and emphasise supplied evidence. Output JSON only.";
  const prompt = `${prefsText(args.prefs)}\n\nGenerate tailored resume suggestions.\n\nCANDIDATE'S CURRENT RESUME/PROFILE:\n${profileText(args.profile)}\n\nTARGET JOB:\n- Title: ${args.job.title}\n- Company: ${args.job.company}\n- Location: ${args.job.location}\n- Description: ${args.job.full_description || args.job.description_snippet}\n\nReturn JSON with: keywords_to_inject (array), skills_to_emphasize (array), summary_rewrite (string), bullet_rewrites (3-5 objects with section,before,after,why), gap_mitigation (1-3 objects with gap,workaround), final_notes (string).`;
  const result = await complete(args.apiKey, system, prompt, .4);
  return { agent_meta: { agent: "resume_tailor", version: "1.0" }, target_role: { title: args.job.title, company: args.job.company }, keywords_to_inject: Array.isArray(result.keywords_to_inject) ? result.keywords_to_inject : [], skills_to_emphasize: Array.isArray(result.skills_to_emphasize) ? result.skills_to_emphasize : [], summary_rewrite: result.summary_rewrite || "", bullet_rewrites: Array.isArray(result.bullet_rewrites) ? result.bullet_rewrites : [], gap_mitigation: Array.isArray(result.gap_mitigation) ? result.gap_mitigation : [], final_notes: result.final_notes || "" };
}

export async function generateCoverLetterDraft(args: { job: DraftJob; profile: DraftProfile; prefs: DraftPreferences; matchScore: number; apiKey: string; tailoredHighlights?: string[] }) {
  if (args.matchScore < 60) throw new Error("Cover letter generation requires a match score of 60 or higher");
  const system = "You are an expert career consultant specialising in Australian professional cover letters. Use Australian English, be concise and direct, and NEVER fabricate claims or experience. Address specific job requirements. Output JSON only.";
  const highlights = args.tailoredHighlights?.length ? `\nKEY HIGHLIGHTS TO EMPHASISE:\n${args.tailoredHighlights.map((h) => `- ${h}`).join("\n")}` : "";
  const prompt = `${prefsText(args.prefs)}\n\nWrite a professional Australian-style 250-350 word cover letter.\n\nCANDIDATE PROFILE:\n${profileText(args.profile)}${highlights}\n\nTARGET JOB:\n- Title: ${args.job.title}\n- Company: ${args.job.company}\n- Location: ${args.job.location}\n- Description: ${args.job.full_description || args.job.description_snippet}\n\nReturn JSON with: cover_letter (paragraphs separated by \\n\\n), key_points_used (array), suggested_subject_lines (array), final_checklist (array).`;
  const result = await complete(args.apiKey, system, prompt, .5);
  return { agent_meta: { agent: "cover_letter_writer", version: "1.0" }, target_role: { title: args.job.title, company: args.job.company }, cover_letter: result.cover_letter || "", key_points_used: Array.isArray(result.key_points_used) ? result.key_points_used : [], suggested_subject_lines: Array.isArray(result.suggested_subject_lines) ? result.suggested_subject_lines : [], final_checklist: Array.isArray(result.final_checklist) ? result.final_checklist : ["Tailored to role", "Matches JD language", "No fabricated claims"] };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
