import { createClient } from "npm:@supabase/supabase-js@2";
import { corsFor, preflight } from "../_shared/cors.ts";
import { evaluateDealbreakers, type CandidatePreferences } from "../_shared/dealbreakers.ts";
import { gradeForScore, whyApply } from "../_shared/grade.ts";
import { resolvePolicy } from "../_shared/policy.ts";
import { enrichJobsFromIds, type ScrapedJob } from "../_shared/seekEnrich.ts";
import { canonicalJson, generateCoverLetterDraft, generateTailoredResumeDraft, sha256 } from "../_shared/tailorDrafts.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

type Profile = { id: string; user_id: string; target_titles: string[]; locations: string[]; salary_min: number | null; last_run_at: string | null; run_interval_minutes: number };

const response = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });

async function caller(req: Request): Promise<{ mode: "cron" | "user"; userId?: string } | null> {
  const cron = Deno.env.get("CRON_SECRET");
  if (cron && req.headers.get("x-cron-secret") === cron) return { mode: "cron" };
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return null;
  if (bearer === serviceKey) return { mode: "cron" };
  const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${bearer}` } } });
  const { data } = await client.auth.getUser(bearer);
  return data.user ? { mode: "user", userId: data.user.id } : null;
}

async function scrapeSeek(keywords: string, location: string): Promise<ScrapedJob[]> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) throw new Error("FIRECRAWL_API_KEY is not configured");
  const seekUrl = new URL("https://www.seek.com.au/jobs");
  seekUrl.searchParams.set("keywords", keywords);
  if (location) seekUrl.searchParams.set("where", location);
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      url: seekUrl.toString(),
      formats: ["markdown", "links"],
      waitFor: 2500,
      timeout: 30000,
      location: { country: "AU", languages: ["en-AU"] },
      onlyMainContent: true,
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl failed (${res.status})`);
  const payload = await res.json();
  const data = payload.data || payload;
  const markdown = String(data.markdown ?? "");
  const links: string[] = Array.isArray(data.links) ? data.links : [];
  const seen = new Set<string>();
  const jobs: ScrapedJob[] = [];
  const push = (id: string, titleHint?: string) => {
    if (!/^\d+$/.test(id) || seen.has(id) || jobs.length >= 15) return;
    seen.add(id);
    jobs.push({
      seek_job_id: id,
      title: (titleHint && titleHint.trim()) || keywords,
      company: "See SEEK listing",
      location: location || "Australia",
      description_snippet: `SEEK listing discovered for ${keywords}. Open the listing for full details.`,
      job_url: `https://www.seek.com.au/job/${id}`,
    });
  };
  for (const link of links) {
    const match = String(link).match(/seek\.com\.au\/job\/(\d+)/i);
    if (match) push(match[1]);
  }
  const mdMatches = markdown.matchAll(/\[(?<title>[^\]]{3,160})\]\((?<url>https?:\/\/www\.seek\.com\.au\/job\/(?<id>\d+)[^)]*)\)/g);
  for (const m of mdMatches) push(m.groups!.id, m.groups!.title);
  if (jobs.length === 0) {
    for (const m of markdown.matchAll(/seek\.com\.au\/job\/(\d+)/gi)) push(m[1]);
  }
  return jobs.slice(0, 15);
}

async function scoreJob(job: Record<string, unknown>, resume: Record<string, unknown>, prefs: CandidatePreferences | null) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const policy = resolvePolicy(prefs);
  const dealbreakers = evaluateDealbreakers(job as never, prefs);
  const prompt = `Score this candidate/job fit. Use only supplied evidence. Return JSON with scores hard_skills, experience_seniority, impact, credentials, soft_skills (0-100), skill_match_percentage, pros, cons, evidence_gaps, reasoning, strategic_advice.\nCandidate: ${JSON.stringify(resume)}\nPreferences: ${JSON.stringify(prefs)}\nJob: ${JSON.stringify(job)}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: "You are a conservative job-fit evaluator. Output JSON only." }, { role: "user", content: prompt }], temperature: 0.2 }) });
  if (!res.ok) throw new Error(`AI scoring failed (${res.status})`);
  const ai = await res.json();
  const raw = String(ai.choices?.[0]?.message?.content ?? "").replace(/```json|```/g, "");
  const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw);
  const n = (v: unknown) => Math.max(0, Math.min(100, Number(v) || 0));
  const scores = result.scores ?? result;
  let score = Math.round(n(scores.hard_skills) * .35 + n(scores.experience_seniority) * .30 + n(scores.impact) * .20 + n(scores.credentials) * .10 + n(scores.soft_skills) * .05);
  if (dealbreakers.length) score = Math.min(score, policy.policy_review - 1);
  return { result, scores, score, policy, grade: gradeForScore(score, policy), dealbreakers };
}

const placeholderCompany = (value: unknown) => ["see seek listing", "unknown company"].includes(String(value ?? "").trim().toLowerCase());
const placeholderTitle = (value: unknown, keywords: string) => {
  const title = String(value ?? "").trim().toLowerCase();
  return !title || title === keywords.trim().toLowerCase() || /^seek (job|listing)/i.test(title);
};
const isEnriched = (job: Record<string, unknown>, keywords: string) => !placeholderCompany(job.company) && !placeholderTitle(job.title, keywords) && (!!job.full_description || String(job.description_snippet ?? "").length >= 80);

async function persistDraft(args: { userId: string; job: Record<string, unknown>; type: "resume" | "cover_letter"; artifactType: "tailored_resume" | "cover_letter"; content: unknown; sourceResumeRevisionId?: string | null }) {
  const { userId, job, type, artifactType, content, sourceResumeRevisionId } = args;
  const { data: previous } = await admin.from("document_revisions").select("id,revision_number").eq("user_id", userId).eq("job_id", job.id).eq("document_type", type).order("revision_number", { ascending: false }).limit(1).maybeSingle();
  const { error: revisionError } = await admin.from("document_revisions").insert({ user_id: userId, job_id: job.id, document_type: type, source_resume_revision_id: sourceResumeRevisionId || null, revision_number: (previous?.revision_number ?? 0) + 1, supersedes_revision_id: previous?.id ?? null, content, content_hash: await sha256(canonicalJson(content)), truth_check_status: "pending", approval_status: "pending", agent_version: "job-pipeline" });
  if (revisionError) throw revisionError;
  const { error: artifactError } = await admin.from("job_artifacts").insert({ user_id: userId, job_id: job.id, artifact_type: artifactType, content, agent: "job-pipeline", version: "1.0" });
  if (artifactError) throw artifactError;
}

async function draftPackage(job: Record<string, unknown>, userId: string, profile: Record<string, unknown>, prefs: CandidatePreferences | null, score: number, resumeRevisionId?: string | null) {
  const { data: artifacts } = await admin.from("job_artifacts").select("artifact_type").eq("user_id", userId).eq("job_id", job.id);
  const { data: revisions } = await admin.from("document_revisions").select("document_type,approval_status").eq("user_id", userId).eq("job_id", job.id).in("approval_status", ["pending", "approved"]);
  const existing = new Set([...(artifacts ?? []).map((row) => row.artifact_type), ...(revisions ?? []).map((row) => row.document_type === "resume" ? "tailored_resume" : "cover_letter")]);
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  if (!existing.has("tailored_resume")) {
    const content = await generateTailoredResumeDraft({ job: job as never, profile, prefs, matchScore: score, apiKey: key });
    await persistDraft({ userId, job, type: "resume", artifactType: "tailored_resume", content, sourceResumeRevisionId: resumeRevisionId });
  }
  if (!existing.has("cover_letter")) {
    const content = await generateCoverLetterDraft({ job: job as never, profile, prefs, matchScore: score, apiKey: key });
    await persistDraft({ userId, job, type: "cover_letter", artifactType: "cover_letter", content, sourceResumeRevisionId: resumeRevisionId });
  }
  for (const taskType of ["tailor_resume", "cover_letter"]) await admin.from("assistant_tasks").upsert({ user_id: userId, task_type: taskType, job_id: job.id, status: "succeeded", idempotency_key: `pipeline:${job.id}:${taskType}`, input_snapshot_hash: `${profile.updated_at ?? resumeRevisionId ?? "master"}:${job.updated_at}`, last_error: null }, { onConflict: "user_id,idempotency_key" });
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405, cors);
  const identity = await caller(req);
  if (!identity) return response({ error: "Unauthorized" }, 401, cors);
  const body = await req.json().catch(() => ({})) as { force?: boolean; user_id?: string; search_profile_id?: string };
  if (identity.mode === "user" && body.user_id && body.user_id !== identity.userId) return response({ error: "Forbidden" }, 403, cors);
  let query = admin.from("search_profiles").select("id,user_id,target_titles,locations,salary_min,last_run_at,run_interval_minutes").eq("active", true);
  if (identity.mode === "user") query = query.eq("user_id", identity.userId!);
  else if (body.user_id) query = query.eq("user_id", body.user_id);
  if (body.search_profile_id) query = query.eq("id", body.search_profile_id);
  const { data, error } = await query;
  if (error) return response({ error: error.message }, 500, cors);
  const summaries: unknown[] = [];
  for (const profile of (data ?? []) as Profile[]) {
    if (!body.force && profile.last_run_at && Date.now() - new Date(profile.last_run_at).getTime() < profile.run_interval_minutes * 60_000) continue;
    const { data: run } = await admin.from("pipeline_runs").insert({ user_id: profile.user_id, search_profile_id: profile.id }).select("id").single();
    const counts = { jobs_found: 0, jobs_scored: 0, jobs_hidden: 0, jobs_strong: 0 };
    try {
      const keywords = profile.target_titles.slice(0, 3).join(" ");
      if (!keywords) throw new Error("Search profile has no target titles");
      const scraped = await scrapeSeek(keywords, profile.locations[0] ?? "");
      counts.jobs_found = scraped.length;
      const { data: existing } = await admin.from("jobs").select("*").eq("user_id", profile.user_id).in("seek_job_id", scraped.map((j) => j.seek_job_id));
      const existingIds = new Set((existing ?? []).map((j) => j.seek_job_id));
      const existingBySeekId = new Map((existing ?? []).map((job) => [job.seek_job_id, job]));
      const needsEnrichment = scraped.filter((job) => {
        const current = existingBySeekId.get(job.seek_job_id);
        return !current || !isEnriched(current, keywords);
      }).slice(0, 8);
      const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY")!;
      const enriched = needsEnrichment.length ? (await enrichJobsFromIds(needsEnrichment.map((job) => job.seek_job_id), firecrawlKey, 8)).jobs : [];
      const enrichedBySeekId = new Map(enriched.map((job) => [job.seek_job_id, job]));
      const rows = scraped.map((stub) => {
        const current = existingBySeekId.get(stub.seek_job_id);
        const source = enrichedBySeekId.get(stub.seek_job_id) ?? (current && isEnriched(current, keywords) ? current : stub);
        return { seek_job_id: stub.seek_job_id, title: source.title, company: source.company, location: source.location, salary_range: source.salary_range, work_type: source.work_type, work_arrangement: source.work_arrangement, description_snippet: source.description_snippet, full_description: source.full_description, job_url: source.job_url || stub.job_url, date_posted: source.date_posted, user_id: profile.user_id, search_profile_id: profile.id, pipeline_status: existingIds.has(stub.seek_job_id) ? undefined : "inbox", triage_source: existingIds.has(stub.seek_job_id) ? undefined : "agent", date_scraped: new Date().toISOString() };
      });
      for (const row of rows) {
        const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
        await admin.from("jobs").upsert(clean, { onConflict: "user_id,seek_job_id" });
      }
      const { data: jobs } = await admin.from("jobs").select("*").eq("user_id", profile.user_id).in("seek_job_id", scraped.map((j) => j.seek_job_id));
      const { data: resume } = await admin.from("resume_profile").select("*").eq("user_id", profile.user_id).maybeSingle();
      const { data: prefs } = await admin.from("candidate_preferences").select("*").eq("user_id", profile.user_id).maybeSingle();
      const { data: approvedRevision } = await admin.from("resume_revisions").select("*").eq("user_id", profile.user_id).not("approved_at", "is", null).order("revision_number", { ascending: false }).limit(1).maybeSingle();
      if (!resume && !approvedRevision) throw new Error("No resume profile; jobs imported but scoring skipped");
      const draftProfile = resume?.raw_text ? resume : approvedRevision ? { ...(approvedRevision.structured_profile as Record<string, unknown>), raw_text: approvedRevision.raw_text } : null;
      let packagesDrafted = 0;
      for (const job of jobs ?? []) {
        const { data: prior } = await admin.from("job_matches").select("id,grade,match_score").eq("user_id", profile.user_id).eq("job_id", job.id).maybeSingle();
        if (!prior && (!resume || placeholderCompany(job.company) || placeholderTitle(job.title, keywords))) continue;
        const scored = prior ? null : await scoreJob(job, resume!, prefs as CandidatePreferences | null);
        const arr = (v: unknown) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
        if (scored) {
          await admin.from("job_matches").upsert({ user_id: profile.user_id, job_id: job.id, resume_profile_id: resume!.id, match_score: scored.score, skill_match_percentage: Number(scored.result.skill_match_percentage) || 0, recommendation: scored.grade === "A" ? "Strong Apply" : scored.grade === "B" ? "Review" : "Deprioritise", reasoning: scored.result.reasoning ?? "", strategic_advice: scored.result.strategic_advice ?? "", why_apply: whyApply(scored.result), grade: scored.grade, pros: arr(scored.result.pros), cons: arr(scored.result.cons), gaps: arr(scored.result.evidence_gaps), risks: arr(scored.result.cons).join("; "), scores: scored.scores, dealbreaker_hits: scored.dealbreakers, scored_at: new Date().toISOString() }, { onConflict: "job_id,resume_profile_id" });
          counts.jobs_scored++;
        }
        const grade = scored?.grade ?? prior!.grade;
        const matchScore = scored?.score ?? prior!.match_score;
        if (scored && (grade === "D" || matchScore < scored.policy.policy_review)) {
          await admin.from("jobs").update({ pipeline_status: "not_fit", triage_source: "auto", auto_hidden_at: new Date().toISOString() }).eq("id", job.id).eq("user_id", profile.user_id);
          counts.jobs_hidden++;
        }
        if (grade === "A") {
          counts.jobs_strong++;
          if (draftProfile && packagesDrafted < 3) {
            try { await draftPackage(job, profile.user_id, draftProfile, prefs as CandidatePreferences | null, matchScore, approvedRevision?.id); packagesDrafted++; }
            catch (error) {
              console.error(`[run-job-pipeline] Drafting failed for ${job.id}`, error);
              for (const taskType of ["tailor_resume", "cover_letter"]) await admin.from("assistant_tasks").upsert({ user_id: profile.user_id, task_type: taskType, job_id: job.id, status: "pending", idempotency_key: `pipeline:${job.id}:${taskType}`, input_snapshot_hash: `${resume?.updated_at ?? approvedRevision?.id ?? "master"}:${job.updated_at}`, last_error: error instanceof Error ? error.message : String(error) }, { onConflict: "user_id,idempotency_key" });
            }
          }
        }
      }
      await admin.from("search_profiles").update({ last_run_at: new Date().toISOString(), last_run_status: resume ? "completed" : "warning", last_error: resume ? null : "Approved resume revision available for drafts; scoring skipped without resume_profile" }).eq("id", profile.id);
      await admin.from("pipeline_runs").update({ ...counts, status: "completed", finished_at: new Date().toISOString() }).eq("id", run?.id);
      summaries.push({ search_profile_id: profile.id, status: "completed", ...counts });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin.from("search_profiles").update({ last_run_at: new Date().toISOString(), last_run_status: "failed", last_error: message }).eq("id", profile.id);
      await admin.from("pipeline_runs").update({ ...counts, status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", run?.id);
      summaries.push({ search_profile_id: profile.id, status: "failed", error: message, ...counts });
    }
  }
  return response({ profiles: summaries, totals: summaries.length }, 200, cors);
});
