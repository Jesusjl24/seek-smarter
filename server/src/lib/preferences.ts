import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { chatJson } from "../ai.js";
import type { Config } from "../config.js";
import { aiModelName, hasAiKey } from "../config.js";
import { decodeRow } from "../db.js";
import { finishTraceStep, startTraceStep } from "./runTrace.js";
import { parseSalaryFloor } from "./dealbreakers.js";

export const LIKE_CHIPS = ["great fit", "right seniority", "good salary", "location", "interesting work"] as const;
export const DISLIKE_CHIPS = ["wrong industry", "too junior", "salary", "location", "not for me"] as const;
export const TRAINING_ACTIONS = new Set(["like", "dislike"]);

const STOP = new Set(["the","a","an","and","or","of","for","to","in","on","at","with","by","from","as","is","it","this","that","senior","junior","lead","manager","head"]);
const RECRUITER = /\b(recruit|talent|interim|partners|people|staffing|hiring|consulting group)\b/i;
const INDUSTRY_WORDS: Record<string, RegExp> = {
  government: /\b(government|public sector|council|aps|federal|state)\b/i,
  banking: /\b(bank|finance|fintech|insurance|wealth)\b/i,
  health: /\b(health|hospital|clinical|medical|pharma)\b/i,
  technology: /\b(software|digital|technology|it |saas|cyber|data)\b/i,
  recruitment: /\b(recruit|talent acquisition|staffing)\b/i,
  education: /\b(university|school|education|tertiary)\b/i,
};

export type Reaction = {
  job_id: string;
  action: "like" | "dislike";
  reason: string | null;
  note: string | null;
  chips: string[];
  created_at: string;
  title: string;
  company: string;
  location: string;
  salary_range: string | null;
  work_type: string | null;
  work_arrangement: string | null;
  description_snippet: string;
};

function asChips(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try { return asChips(JSON.parse(value)); } catch { return [value.trim()]; }
  }
  return [];
}

export function latestReactions(db: Database.Database, userId: string): Reaction[] {
  const rows = db.prepare(`
    SELECT f.job_id, f.action, f.reason, f.note, f.chips, f.created_at,
           j.title, j.company, j.location, j.salary_range, j.work_type, j.work_arrangement, j.description_snippet
    FROM job_feedback f
    JOIN jobs j ON j.id = f.job_id AND j.user_id = f.user_id
    WHERE f.user_id=? AND f.action IN ('like','dislike')
    ORDER BY f.created_at DESC
  `).all(userId) as any[];
  const seen = new Set<string>();
  const out: Reaction[] = [];
  for (const row of rows) {
    if (seen.has(row.job_id)) continue;
    seen.add(row.job_id);
    out.push({
      ...row,
      chips: asChips(row.chips),
      title: row.title || "",
      company: row.company || "",
      location: row.location || "",
      description_snippet: row.description_snippet || "",
    });
  }
  return out;
}

export function dislikedJobIds(db: Database.Database, userId: string): string[] {
  return latestReactions(db, userId).filter((item) => item.action === "dislike").map((item) => item.job_id);
}

function tokens(text: string): string[] {
  return String(text || "").toLowerCase().replace(/[^a-z0-9+\s]/g, " ").split(/\s+/).filter((word) => word.length > 2 && !STOP.has(word));
}

function industriesOf(job: { title?: string; company?: string; description_snippet?: string; location?: string }): string[] {
  const hay = `${job.title || ""} ${job.company || ""} ${job.description_snippet || ""}`;
  return Object.entries(INDUSTRY_WORDS).filter(([, re]) => re.test(hay)).map(([name]) => name);
}

function salaryBand(salary: string | null | undefined): string | null {
  const floor = parseSalaryFloor(salary);
  if (!floor) return null;
  if (floor < 140000) return "under $140k";
  if (floor < 150000) return "$140k–$150k";
  if (floor < 180000) return "$150k–$180k";
  return "$180k+";
}

function countList(items: Array<string | null | undefined>, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const raw of items) {
    const value = String(raw || "").trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([name]) => name);
}

export function aggregatePreferences(db: Database.Database, userId: string) {
  const reactions = latestReactions(db, userId);
  const liked = reactions.filter((item) => item.action === "like");
  const disliked = reactions.filter((item) => item.action === "dislike");
  const side = (list: Reaction[]) => ({
    titles: countList(list.map((item) => item.title)),
    companies: countList(list.map((item) => item.company)),
    industries: countList(list.flatMap((item) => industriesOf(item))),
    keywords: countList(list.flatMap((item) => tokens(`${item.title} ${item.description_snippet}`)), 12),
    salary_bands: countList(list.map((item) => salaryBand(item.salary_range))),
    work_modes: countList(list.map((item) => item.work_arrangement || item.work_type)),
    chips: countList(list.flatMap((item) => item.chips.length ? item.chips : [item.reason])),
  });
  return {
    likes: liked.length,
    dislikes: disliked.length,
    liked: side(liked),
    disliked: side(disliked),
  };
}

export type PreferenceAggregates = ReturnType<typeof aggregatePreferences>;

export function learnedPreferenceAdjustment(job: any, aggregates: PreferenceAggregates | null | undefined) {
  const empty = { score: null as number | null, delta: 0, note: null as string | null, evidence: null as string | null };
  if (!aggregates || (aggregates.likes === 0 && aggregates.dislikes === 0)) return empty;
  let delta = 0;
  const evidence: string[] = [];
  const titleTokens = new Set(tokens(job.title || ""));
  const jobIndustries = industriesOf(job);
  const jobBand = salaryBand(job.salary_range);
  const jobMode = job.work_arrangement || job.work_type;
  const company = String(job.company || "");

  const likedCompany = aggregates.liked.companies.includes(company);
  const dislikedCompany = aggregates.disliked.companies.includes(company);
  if (likedCompany) { delta += 6; evidence.push(`You liked another role at ${company}.`); }
  if (dislikedCompany) { delta -= 8; evidence.push(`You disliked another role at ${company}.`); }

  const similarDisliked = (aggregates.disliked.titles || []).filter((title) => tokens(title).some((word) => titleTokens.has(word))).length;
  const similarLiked = (aggregates.liked.titles || []).filter((title) => tokens(title).some((word) => titleTokens.has(word))).length;
  if (similarLiked) { delta += Math.min(6, similarLiked * 2); evidence.push(`You liked ${similarLiked} similar title${similarLiked === 1 ? "" : "s"}.`); }
  if (similarDisliked) { delta -= Math.min(8, similarDisliked * 3); evidence.push(`You disliked ${similarDisliked} similar title${similarDisliked === 1 ? "" : "s"}.`); }

  const recruiterDislikes = (aggregates.disliked.companies || []).filter((name) => RECRUITER.test(name)).length;
  if (recruiterDislikes >= 2 && RECRUITER.test(company)) {
    delta -= 6;
    evidence.unshift(`You disliked ${recruiterDislikes} similar recruiter-posted roles.`);
  }

  const industryHits = jobIndustries.filter((name) => aggregates.disliked.industries.includes(name));
  if (industryHits.length) { delta -= 5; evidence.push(`You have disliked ${industryHits[0]} roles.`); }
  const likedIndustry = jobIndustries.filter((name) => aggregates.liked.industries.includes(name));
  if (likedIndustry.length) { delta += 3; evidence.push(`You have liked ${likedIndustry[0]} roles.`); }

  if (jobBand && aggregates.disliked.salary_bands.includes(jobBand) && aggregates.disliked.chips.includes("salary")) {
    delta -= 4;
    evidence.push(`You have disliked roles in the ${jobBand} salary band.`);
  }
  if (jobMode && aggregates.disliked.work_modes.includes(jobMode) && aggregates.disliked.chips.includes("location")) {
    delta -= 3;
    evidence.push(`You have disliked ${jobMode} roles.`);
  }

  delta = Math.max(-12, Math.min(12, delta));
  if (!evidence.length && delta === 0) {
    return { score: 50, delta: 0, note: "No close match to your previous likes or dislikes.", evidence: null };
  }
  const score = Math.max(0, Math.min(100, 50 + delta * 4));
  const direction = delta > 0 ? "This looks closer to roles you have liked." : delta < 0 ? "This looks closer to roles you have disliked." : "Mixed signals from your previous reactions.";
  return { score, delta, note: direction, evidence: evidence[0] || null };
}

export function scriptMemoFromAggregates(aggregates: PreferenceAggregates): { like_summary: string; avoid_summary: string; memo_text: string } {
  const likeBits: string[] = [];
  if (aggregates.liked.titles.length) likeBits.push(`roles such as ${aggregates.liked.titles.slice(0, 3).join(", ")}`);
  if (aggregates.liked.companies.length) likeBits.push(`companies like ${aggregates.liked.companies.slice(0, 3).join(", ")}`);
  if (aggregates.liked.industries.length) likeBits.push(`${aggregates.liked.industries.join(" and ")} work`);
  if (aggregates.liked.work_modes.length) likeBits.push(`${aggregates.liked.work_modes[0]} arrangements`);
  if (aggregates.liked.salary_bands.length) likeBits.push(`pay in the ${aggregates.liked.salary_bands[0]} range`);
  const avoidBits: string[] = [];
  if (aggregates.disliked.titles.length) avoidBits.push(`roles such as ${aggregates.disliked.titles.slice(0, 3).join(", ")}`);
  if (aggregates.disliked.companies.length) avoidBits.push(`companies like ${aggregates.disliked.companies.slice(0, 3).join(", ")}`);
  if (aggregates.disliked.industries.length) avoidBits.push(`${aggregates.disliked.industries.join(" and ")} work`);
  if (aggregates.disliked.chips.length) avoidBits.push(`feedback around ${aggregates.disliked.chips.slice(0, 3).join(", ")}`);
  const like_summary = aggregates.likes ? `You tend to like ${likeBits.join("; ") || "the roles you have thumbs-upped"}.` : "You have not marked any roles as a like yet.";
  const avoid_summary = aggregates.dislikes ? `You tend to avoid ${avoidBits.join("; ") || "the roles you have thumbs-downed"}.` : "You have not marked any roles as a dislike yet.";
  return { like_summary, avoid_summary, memo_text: `${like_summary}\n\n${avoid_summary}`.trim() };
}

export function getPreferenceProfile(db: Database.Database, userId: string) {
  return decodeRow(db.prepare("SELECT * FROM preference_profiles WHERE user_id=?").get(userId)) as any;
}

export function upsertPreferenceProfile(db: Database.Database, userId: string, patch: Record<string, unknown>) {
  const now = new Date().toISOString();
  const current = getPreferenceProfile(db, userId) || {
    user_id: userId, memo_text: "", generated_memo: "", like_summary: "", avoid_summary: "", aggregates_json: {}, user_edited: 0, updated_at: now, last_learned_at: null,
  };
  const next = { ...current, ...patch, user_id: userId, updated_at: now };
  next.user_edited = next.user_edited ? 1 : 0;
  if (next.aggregates_json && typeof next.aggregates_json !== "string") next.aggregates_json = JSON.stringify(next.aggregates_json);
  const keys = Object.keys(next);
  db.prepare(`INSERT INTO preference_profiles(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")}) ON CONFLICT(user_id) DO UPDATE SET ${keys.filter((k) => k !== "user_id").map((k) => `${k}=excluded.${k}`).join(",")}`).run(...keys.map((k) => next[k]));
  return getPreferenceProfile(db, userId);
}

export function savePreferenceMemo(db: Database.Database, userId: string, memoText: string) {
  return upsertPreferenceProfile(db, userId, { memo_text: String(memoText || "").trim(), user_edited: 1 });
}

export function resetPreferenceMemo(db: Database.Database, userId: string) {
  const aggregates = aggregatePreferences(db, userId);
  const generated = scriptMemoFromAggregates(aggregates);
  return upsertPreferenceProfile(db, userId, {
    ...generated,
    generated_memo: generated.memo_text,
    aggregates_json: aggregates,
    user_edited: 0,
    last_learned_at: new Date().toISOString(),
  });
}

export function preferencePromptPayload(db: Database.Database, userId: string) {
  const profile = getPreferenceProfile(db, userId);
  const reactions = latestReactions(db, userId).slice(0, 8);
  const examples = (action: "like" | "dislike") => reactions.filter((item) => item.action === action).slice(0, 5).map((item) => ({
    title: item.title,
    company: item.company,
    reason: item.reason || item.note || item.chips.join(", ") || null,
  }));
  return {
    learned_preferences_memo: profile?.memo_text || "",
    like_summary: profile?.like_summary || "",
    avoid_summary: profile?.avoid_summary || "",
    recent_likes: examples("like"),
    recent_dislikes: examples("dislike"),
  };
}

export function publicPreferenceProfile(db: Database.Database, userId: string) {
  const profile = getPreferenceProfile(db, userId);
  const aggregates = profile?.aggregates_json && typeof profile.aggregates_json === "object"
    ? profile.aggregates_json
    : aggregatePreferences(db, userId);
  return {
    memo_text: profile?.memo_text || "",
    generated_memo: profile?.generated_memo || "",
    like_summary: profile?.like_summary || "",
    avoid_summary: profile?.avoid_summary || "",
    aggregates,
    user_edited: !!profile?.user_edited,
    updated_at: profile?.updated_at || null,
    last_learned_at: profile?.last_learned_at || null,
    recent: latestReactions(db, userId).slice(0, 12).map((item) => ({
      job_id: item.job_id, action: item.action, reason: item.reason, note: item.note, chips: item.chips, title: item.title, company: item.company, created_at: item.created_at,
    })),
  };
}

export function recordJobFeedback(db: Database.Database, userId: string, jobId: string, body: { action: string; reason?: string | null; note?: string | null; chips?: unknown }) {
  const action = String(body.action || "").trim();
  const workflow: Record<string, string> = { applied: "applied", not_for_me: "not_fit", save_for_later: "shortlist" };
  if (!workflow[action] && !TRAINING_ACTIONS.has(action)) return { ok: false as const, status: 400, error: "Invalid action" };
  if (!db.prepare("SELECT 1 FROM jobs WHERE id=? AND user_id=?").get(jobId, userId)) return { ok: false as const, status: 404, error: "Not found" };
  const now = new Date().toISOString();
  const chips = JSON.stringify(asChips(body.chips));
  const note = body.note ? String(body.note).trim() || null : null;
  const reason = body.reason ? String(body.reason).trim() || null : asChips(body.chips)[0] || null;
  db.prepare("INSERT INTO job_feedback(id,user_id,job_id,action,reason,note,chips,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(randomUUID(), userId, jobId, action, reason, note, chips, now);
  if (workflow[action]) {
    db.prepare("UPDATE jobs SET pipeline_status=?,triage_source='manual',updated_at=? WHERE id=? AND user_id=?").run(workflow[action], now, jobId, userId);
  }
  return { ok: true as const, status: 200, action };
}

export async function runLearner(db: Database.Database, config: Config, userId: string, traceId: string, sortOrder = 3) {
  const previous = getPreferenceProfile(db, userId);
  const since = previous?.last_learned_at || "1970-01-01T00:00:00.000Z";
  const newCount = (db.prepare("SELECT count(*) c FROM job_feedback WHERE user_id=? AND action IN ('like','dislike') AND created_at>?").get(userId, since) as any).c as number;
  const aggregates = aggregatePreferences(db, userId);
  let generated = scriptMemoFromAggregates(aggregates);
  let usedAgent = false;
  let model: string | null = null;
  if (newCount > 0 && hasAiKey(config) && (aggregates.likes + aggregates.dislikes) > 0) {
    try {
      const result: any = await chatJson(config, {
        system: "Summarise this person's job likes and dislikes in short, calm, plain English. Use only the evidence provided. Do not invent employers or facts. Return JSON with like_summary, avoid_summary, and memo_text (two short paragraphs: what they like, then what they avoid).",
        user: JSON.stringify({ aggregates, recent: latestReactions(db, userId).slice(0, 12).map((item) => ({ action: item.action, title: item.title, company: item.company, reason: item.reason, note: item.note, chips: item.chips })) }),
      });
      const like_summary = String(result.like_summary || generated.like_summary).trim() || generated.like_summary;
      const avoid_summary = String(result.avoid_summary || generated.avoid_summary).trim() || generated.avoid_summary;
      const memo_text = String(result.memo_text || `${like_summary}\n\n${avoid_summary}`).trim();
      generated = { like_summary, avoid_summary, memo_text };
      usedAgent = true;
      model = aiModelName(config);
    } catch { /* keep the script memo */ }
  }
  const keepUserMemo = previous?.user_edited && previous?.memo_text && previous.memo_text !== previous.generated_memo;
  upsertPreferenceProfile(db, userId, {
    like_summary: generated.like_summary,
    avoid_summary: generated.avoid_summary,
    generated_memo: generated.memo_text,
    memo_text: keepUserMemo ? previous.memo_text : generated.memo_text,
    aggregates_json: aggregates,
    user_edited: keepUserMemo ? 1 : 0,
    last_learned_at: new Date().toISOString(),
  });
  const step = startTraceStep(db, traceId, {
    stage: "learner",
    actorType: usedAgent ? "agent" : "script",
    actorName: "Updates what you like and avoid from your reactions",
    model,
    sortOrder,
  });
  const outputs = newCount
    ? `${usedAgent ? "Learner (agent)" : "Learner"}: updated your preferences from ${newCount} new reaction${newCount === 1 ? "" : "s"}.`
    : previous?.memo_text
      ? "Learner: no new reactions since the last run. Using your saved preference memo."
      : "Learner: no likes or dislikes yet, so there is nothing new to learn.";
  finishTraceStep(db, step.id, {
    inputs_summary: `${aggregates.likes} like${aggregates.likes === 1 ? "" : "s"} and ${aggregates.dislikes} dislike${aggregates.dislikes === 1 ? "" : "s"} on file.${newCount ? ` ${newCount} new since the last learning pass.` : ""}`,
    outputs_summary: outputs,
    counts: { likes: aggregates.likes, dislikes: aggregates.dislikes, new_reactions: newCount },
  });
  return { stepId: step.id, newCount, usedAgent };
}
