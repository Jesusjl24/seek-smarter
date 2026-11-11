import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { aiKeyName, aiModelName, hasAiKey, type Config } from "../config.js";
import { scrapeSeek as defaultScrapeSeek } from "./seekScrape.js";
import { scoreJob } from "./scoreJob.js";
import { isValidJob } from "./seekEnrich.js";
import { draftAGradePackages } from "./pipelineDrafts.js";
import { ensureOwnerDefaults } from "./ownerDefaults.js";
import { deterministicFilter } from "./dealbreakers.js";
import { chatJson } from "../ai.js";
import { decodeRow } from "../db.js";
import { uniqueSanitizedReasons } from "./providerErrors.js";
import { pipelineSearchGapMs } from "./firecrawl.js";
import { reviewGrade } from "./skeptic.js";
import { finishRunTrace, finishTraceStep, loadLatestTrace, recordDecision, startRunTrace, startTraceStep, type Funnel } from "./runTrace.js";

const sydneyDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

let scrapeSeekImpl = defaultScrapeSeek;
export function setScrapeSeekForTests(fn?: typeof defaultScrapeSeek) {
  scrapeSeekImpl = fn || defaultScrapeSeek;
}

const RAW_KEY = /\b(?:worth_your_time|filtered_out|jobs_found|jobs_new|searches_run|searches_total|top_matches|filtered_counts)\s*:\s*\S+/g;

export function sanitizeBriefingProse(text: string): string {
  return String(text || "")
    .replace(RAW_KEY, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

export async function runPipeline(db: Database.Database, config: Config, userId: string, _force = false) {
  void _force;
  ensureOwnerDefaults(db, userId);
  const prefs = decodeRow(db.prepare("SELECT * FROM candidate_preferences WHERE user_id=?").get(userId)) as any;
  const profiles = db.prepare("SELECT * FROM search_profiles WHERE user_id=? AND active=1").all(userId) as any[];
  const resume = db.prepare("SELECT * FROM resume_profile WHERE user_id=?").get(userId) as any;
  const trace = startRunTrace(db, userId);
  const results: any[] = [];
  let packagesDrafted = 0;
  const touched = new Set<string>();
  const searchGap = pipelineSearchGapMs();
  const seenSeekIds = new Set<string>();
  let briefingId: string | null = null;

  try {
    const scout = startTraceStep(db, trace.id, { stage: "scout", actorType: "script", actorName: "SEEK search via Firecrawl", sortOrder: 1 });
    const scoutInputs = profiles.length
      ? `Ran ${profiles.length} saved search${profiles.length === 1 ? "" : "es"}: ${profiles.map((p) => p.name).join(", ")}.`
      : "No active saved searches to run.";
    let scoutError: string | null = null;

    for (const p of profiles) {
      if (results.length && searchGap) await new Promise((resolve) => setTimeout(resolve, searchGap));
      const id = randomUUID(), started = new Date().toISOString();
      db.prepare("INSERT INTO pipeline_runs(id,user_id,search_profile_id,status,started_at) VALUES(?,?,?,?,?)").run(id, userId, p.id, "running", started);
      let found = 0, added = 0;
      const reasons: string[] = [];
      try {
        const titles = JSON.parse(p.target_titles || "[]");
        if (!titles.length) {
          const message = "Search profile has no target titles";
          db.prepare("UPDATE pipeline_runs SET status='completed',completed_at=?,error=?,summary=? WHERE id=?").run(new Date().toISOString(), message, JSON.stringify({ skipped: [message] }), id);
          results.push({ id, status: "completed", name: p.name, jobs_found: 0, jobs_new: 0, jobs_scored: 0, jobs_hidden: 0, jobs_strong: 0, jobs_drafted: 0, skipped: [message] });
          continue;
        }
        const scraped = await scrapeSeekImpl(config, { keywords: titles.slice(0, 3).join(" "), locations: JSON.parse(p.locations || "[]"), salaryMin: p.salary_min || prefs.salary_min, workType: "Full time", limit: 15 });
        found = scraped.jobs.length;
        if (scraped.diagnostics?.message) reasons.push(scraped.diagnostics.message);
        else if (scraped.diagnostics?.possible_blocking) reasons.push("SEEK may be blocking automated requests");
        for (const job of scraped.jobs) {
          if (!isValidJob(job)) continue;
          const exists = db.prepare("SELECT id FROM jobs WHERE user_id=? AND seek_job_id=?").get(userId, job.seek_job_id) as any;
          if (!exists) {
            db.prepare("INSERT INTO jobs(id,user_id,seek_job_id,title,company,location,salary_range,work_type,work_arrangement,description_snippet,full_description,job_url,date_posted,date_scraped,pipeline_status,updated_at,search_profile_id,triage_source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
              .run(randomUUID(), userId, job.seek_job_id, job.title, job.company, job.location || "", job.salary_range || null, job.work_type || null, job.work_arrangement || null, job.description_snippet || "", job.full_description || null, job.job_url, job.date_posted || null, new Date().toISOString(), "inbox", new Date().toISOString(), p.id, "agent");
            added++;
            const inserted = db.prepare("SELECT id FROM jobs WHERE user_id=? AND seek_job_id=?").get(userId, job.seek_job_id) as any; if (inserted) touched.add(inserted.id);
          } else {
            db.prepare("UPDATE jobs SET title=?,company=?,location=?,salary_range=?,work_type=?,work_arrangement=?,description_snippet=?,full_description=?,job_url=?,updated_at=? WHERE id=? AND user_id=?")
              .run(job.title, job.company, job.location || "", job.salary_range || null, job.work_type || null, job.work_arrangement || null, job.description_snippet || "", job.full_description || null, job.job_url, new Date().toISOString(), exists.id, userId);
            touched.add(exists.id);
          }
        }
        results.push({ id, status: "completed", name: p.name, jobs_found: found, jobs_new: added, jobs_scored: 0, jobs_hidden: 0, jobs_strong: 0, jobs_drafted: 0, skipped: reasons, _profileId: p.id });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Pipeline failed";
        db.prepare("UPDATE pipeline_runs SET status='completed',completed_at=?,error=?,summary=? WHERE id=?").run(new Date().toISOString(), message, JSON.stringify({ skipped: [message] }), id);
        results.push({ id, status: "completed", name: p.name, jobs_found: found, jobs_new: added, jobs_scored: 0, skipped: [message] });
      }
    }
    if (!profiles.length) {
      results.push({ id: null, status: "completed", name: null, jobs_found: 0, jobs_new: 0, jobs_scored: 0, skipped: ["No active saved searches to run"] });
    }

    const foundTotal = results.reduce((n, r) => n + (r.jobs_found || 0), 0);
    const newTotal = results.reduce((n, r) => n + (r.jobs_new || 0), 0);
    const scoutReasons = uniqueSanitizedReasons(results.flatMap((result) => result.skipped || []));
    scoutError = scoutReasons.find((reason) => /firecrawl|SEEK/i.test(reason)) || null;
    finishTraceStep(db, scout.id, {
      inputs_summary: scoutInputs,
      outputs_summary: foundTotal
        ? `Found ${foundTotal} listing${foundTotal === 1 ? "" : "s"} (${newTotal} new).${scoutReasons.length ? ` Notes: ${scoutReasons.join(" ")}` : ""}`
        : (scoutReasons.length ? `No listings were collected. ${scoutReasons.join(" ")}` : "No listings were collected."),
      counts: { searches: profiles.length, found: foundTotal, new: newTotal },
      error: scoutError,
    });

    const gate = startTraceStep(db, trace.id, { stage: "gatekeeper", actorType: "script", actorName: "Salary, contract, industry, and duplicate checks", sortOrder: 2 });
    let dropped = 0, kept = 0, duplicates = 0;
    for (const jobId of touched) {
      const candidate = db.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").get(jobId, userId) as any;
      if (!candidate) continue;
      const isDup = seenSeekIds.has(candidate.seek_job_id);
      seenSeekIds.add(candidate.seek_job_id);
      const filter = deterministicFilter(candidate, prefs);
      if (filter.reason) {
        db.prepare("UPDATE jobs SET pipeline_status='not_fit',triage_source='auto',auto_hidden_at=?,filter_reason=?,updated_at=? WHERE id=? AND user_id=?").run(new Date().toISOString(), filter.reason, new Date().toISOString(), jobId, userId);
        dropped++;
        recordDecision(db, {
          traceId: trace.id, stepId: gate.id, jobId, seekJobId: candidate.seek_job_id, title: candidate.title, company: candidate.company,
          stage: "gatekeeper", decision: "dropped", reason: filter.humanReason || filter.hits[0] || "Filtered out.", evidence: filter.evidence,
        });
      } else if (isDup) {
        duplicates++;
        kept++;
        recordDecision(db, {
          traceId: trace.id, stepId: gate.id, jobId, seekJobId: candidate.seek_job_id, title: candidate.title, company: candidate.company,
          stage: "gatekeeper", decision: "kept", reason: "This listing was already in your library, so it was treated as a duplicate and kept in place.", evidence: [{ kind: "seek_job_id", text: String(candidate.seek_job_id) }],
        });
      } else {
        kept++;
        recordDecision(db, {
          traceId: trace.id, stepId: gate.id, jobId, seekJobId: candidate.seek_job_id, title: candidate.title, company: candidate.company,
          stage: "gatekeeper", decision: "kept", reason: "Passed the salary floor, full-time, and industry checks.", evidence: candidate.salary_range ? [{ kind: "salary", text: String(candidate.salary_range) }] : [],
        });
      }
    }
    finishTraceStep(db, gate.id, {
      inputs_summary: `Checked ${touched.size} listing${touched.size === 1 ? "" : "s"} against your salary floor, full-time preference, industry exclusions, and duplicates.`,
      outputs_summary: touched.size ? `${kept} passed the filters; ${dropped} ${dropped === 1 ? "was" : "were"} dropped.${duplicates ? ` ${duplicates} ${duplicates === 1 ? "was" : "were"} already in your library.` : ""}` : "There were no new listings to filter.",
      counts: { checked: touched.size, kept, dropped, duplicates },
    });

    const matcher = startTraceStep(db, trace.id, { stage: "matcher", actorType: "agent", actorName: "Grades each role against your resume and goals", model: hasAiKey(config) ? aiModelName(config) : null, sortOrder: 3 });
    let scored = 0, hidden = 0, strong = 0;
    const aGradeJobs: any[] = [];
    const passing = touched.size ? db.prepare(`SELECT * FROM jobs WHERE user_id=? AND pipeline_status!='not_fit' AND id IN (${[...touched].map(() => "?")})`).all(userId, ...touched) as any[] : [];
    let matcherError: string | null = null;
    if (!hasAiKey(config)) {
      if (foundTotal > 0) {
        matcherError = `Scoring skipped: ${aiKeyName(config)} is not configured`;
        for (const result of results) if (result.jobs_found > 0) result.skipped.push(matcherError);
        if (prefs.auto_generate_drafts) {
          const draftSkip = `Drafting skipped: ${aiKeyName(config)} is not configured`;
          for (const result of results) if (result.jobs_found > 0) result.skipped.push(draftSkip);
        }
      }
      finishTraceStep(db, matcher.id, {
        inputs_summary: "Matcher grades roles against your resume and goals.",
        outputs_summary: foundTotal ? `Matcher did not run because ${aiKeyName(config)} is not configured.` : "No listings reached Matcher.",
        counts: { candidates: passing.length, graded: 0 },
        error: matcherError,
      });
    } else if (!resume) {
      matcherError = "Upload a resume before scoring jobs";
      if (passing.length) {
        for (const result of results) if (result.jobs_found > 0) result.skipped.push(matcherError);
        for (const job of passing) {
          recordDecision(db, {
            traceId: trace.id, stepId: matcher.id, jobId: job.id, seekJobId: job.seek_job_id, title: job.title, company: job.company,
            stage: "matcher", decision: "skipped", reason: "Matcher did not grade this role because no resume is on file yet.",
          });
        }
      }
      finishTraceStep(db, matcher.id, {
        inputs_summary: `${passing.length} listing${passing.length === 1 ? "" : "s"} were ready to grade against your resume and goals.`,
        outputs_summary: "Matcher did not run because no resume is on file yet. Upload a resume to get grades, risks, and a chance estimate.",
        counts: { candidates: passing.length, graded: 0 },
        error: matcherError,
      });
    } else {
      for (const job of passing.slice(0, 25)) {
        const already = db.prepare("SELECT job_id FROM job_matches WHERE user_id=? AND job_id=?").get(userId, job.id);
        if (already) continue;
        try {
          const match: any = await scoreJob(db, config, userId, job.id);
          scored++;
          const owner = results.find((result) => result._profileId === job.search_profile_id);
          if (owner) owner.jobs_scored = (owner.jobs_scored || 0) + 1;
          const rawEvidence = typeof match.evidence_json === "string" ? (() => { try { return JSON.parse(match.evidence_json); } catch { return {}; } })() : (match.evidence_json || {});
          const evidence = rawEvidence?.items || (Array.isArray(rawEvidence) ? rawEvidence : []);
          const criteria = typeof match.criteria_json === "string" ? (() => { try { return JSON.parse(match.criteria_json); } catch { return null; } })() : (match.criteria_json || null);
          recordDecision(db, {
            traceId: trace.id, stepId: matcher.id, jobId: job.id, seekJobId: job.seek_job_id, title: job.title, company: job.company,
            stage: "matcher", decision: "graded", reason: match.why_apply || match.reasoning || `Graded ${match.grade}.`,
            evidence, grade: match.grade, score: match.match_score, criteria,
          });
          if (match?.grade === "A") {
            strong++;
            const fullJob = db.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").get(job.id, userId) as any;
            if (fullJob) aGradeJobs.push({ ...fullJob, ...match });
            if (owner) owner.jobs_strong = (owner.jobs_strong || 0) + 1;
          }
          if (match?.grade === "D" || (match?.match_score ?? 0) < (prefs.policy_review ?? 75)) {
            hidden++;
            if (owner) owner.jobs_hidden = (owner.jobs_hidden || 0) + 1;
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : "Scoring failed";
          matcherError = matcherError || message;
          for (const result of results) if (result._profileId === job.search_profile_id) result.skipped.push(message);
          recordDecision(db, {
            traceId: trace.id, stepId: matcher.id, jobId: job.id, seekJobId: job.seek_job_id, title: job.title, company: job.company,
            stage: "matcher", decision: "skipped", reason: message,
          });
        }
      }
      finishTraceStep(db, matcher.id, {
        inputs_summary: `Graded up to ${Math.min(passing.length, 25)} roles that passed the filters, using ${aiModelName(config)} against your resume and goals.`,
        outputs_summary: scored ? `Graded ${scored} role${scored === 1 ? "" : "s"}. ${strong} made the top-pick list.` : "No roles were graded.",
        counts: { candidates: passing.length, graded: scored, top_picks: strong, hidden },
        error: matcherError,
      });
    }

    const skeptic = startTraceStep(db, trace.id, { stage: "skeptic", actorType: "script", actorName: "Checks risks, chance, and whether the grade holds up", sortOrder: 4 });
    const matches = touched.size ? db.prepare(`SELECT j.*, m.grade, m.why_apply, m.risks, m.chance_estimate, m.match_score, m.evidence_json, m.criteria_json FROM jobs j JOIN job_matches m ON m.job_id=j.id AND m.user_id=j.user_id WHERE j.user_id=? AND j.id IN (${[...touched].map(() => "?")})`).all(userId, ...touched) as any[] : [];
    let flagged = 0;
    if (!matches.length) {
      finishTraceStep(db, skeptic.id, {
        inputs_summary: "Analyst / Skeptic reviews each grade for consistency with salary, title, and stated risks.",
        outputs_summary: "This step did not run because no roles were graded.",
        counts: { reviewed: 0, flagged: 0 },
      });
    } else {
      for (const job of matches) {
        const review = reviewGrade(job, job, prefs);
        if (review.decision === "flagged") flagged++;
        recordDecision(db, {
          traceId: trace.id, stepId: skeptic.id, jobId: job.id, seekJobId: job.seek_job_id, title: job.title, company: job.company,
          stage: "skeptic", decision: review.decision, reason: review.reason, grade: job.grade, score: job.match_score,
          evidence: review.flags.map((text) => ({ kind: "sanity_check", text })),
        });
      }
      finishTraceStep(db, skeptic.id, {
        inputs_summary: `Reviewed ${matches.length} graded role${matches.length === 1 ? "" : "s"} for consistency with salary, title seniority, and stated risks.`,
        outputs_summary: flagged ? `${flagged} grade${flagged === 1 ? "" : "s"} looked optimistic and ${flagged === 1 ? "was" : "were"} flagged for a closer look. The rest held up.` : `All ${matches.length} grades looked consistent with the listing details we can check.`,
        counts: { reviewed: matches.length, flagged },
      });
    }

    if (prefs.auto_generate_drafts && aGradeJobs.length && packagesDrafted < 3 && hasAiKey(config) && resume) {
      const drafts = await draftAGradePackages(db, config, userId, aGradeJobs, { limit: 3 - packagesDrafted });
      packagesDrafted += drafts.jobs_drafted;
      const extra = [...drafts.skipped, ...drafts.errors.map((error) => `Draft generation failed: ${error}`)];
      if (extra.length) for (const result of results) result.skipped.push(...extra);
    }

    for (const result of results) {
      if (!result.id) continue;
      const { _profileId, ...rest } = result;
      void _profileId;
      const summary = { jobs_found: rest.jobs_found || 0, jobs_new: rest.jobs_new || 0, jobs_scored: rest.jobs_scored || 0, jobs_hidden: rest.jobs_hidden || 0, jobs_strong: rest.jobs_strong || 0, jobs_drafted: packagesDrafted, skipped: rest.skipped || [] };
      db.prepare("UPDATE pipeline_runs SET status='completed',completed_at=?,jobs_found=?,jobs_new=?,jobs_scored=?,summary=?,error=? WHERE id=?").run(new Date().toISOString(), summary.jobs_found, summary.jobs_new, summary.jobs_scored, JSON.stringify(summary), (rest.skipped || []).join("; ") || null, result.id);
      if (result._profileId) db.prepare("UPDATE search_profiles SET last_run_at=?,updated_at=? WHERE id=? AND user_id=?").run(new Date().toISOString(), new Date().toISOString(), result._profileId, userId);
    }

    const runIds = results.map((result) => result.id).filter(Boolean);
    const rows = touched.size ? db.prepare(`SELECT j.*,m.grade,m.why_apply,m.risks,m.chance_estimate,m.match_score FROM jobs j LEFT JOIN job_matches m ON m.job_id=j.id AND m.user_id=j.user_id WHERE j.user_id=? AND j.id IN (${[...touched].map(() => "?")})`).all(userId, ...touched) as any[] : [];
    const recommended = rows.filter((j) => j.grade === "A" && !["applied", "not_fit"].includes(j.pipeline_status)).sort((a,b) => b.match_score-a.match_score).slice(0,5);
    const worth = rows.filter((j) => j.grade === "B" && !["applied", "not_fit"].includes(j.pipeline_status));
    const filteredCounts = rows.filter((j) => j.filter_reason).reduce((out: any, job) => ({ ...out, [job.filter_reason]: (out[job.filter_reason] || 0) + 1 }), {});
    const allReasons = uniqueSanitizedReasons(results.flatMap((result) => result.skipped || []));
    const stats = { scanned: rows.length, worth_your_time: recommended.length, filtered_out: Object.values(filteredCounts).reduce((n: number, value) => n + Number(value), 0), filtered_counts: filteredCounts, reasons: allReasons, searches_run: profiles.length, searches_total: profiles.length };
    const summaryText = formatBriefingSummary(stats, filteredCounts, allReasons);
    const marketNotes = formatBriefingMarketNotes(rows.length, allReasons);
    let finalSummary = summaryText;
    let finalNotes = marketNotes;
    let brieferActor: "agent" | "script" = "script";
    let brieferModel: string | null = null;
    const briefer = startTraceStep(db, trace.id, { stage: "briefer", actorType: "script", actorName: "Writes the morning briefing", sortOrder: 5 });
    if (hasAiKey(config) && rows.length) {
      try {
        const generated: any = await chatJson(config, {
          system: "Write a concise morning job briefing in plain English. Return JSON with summary_text and market_notes. Do not invent facts. Never use raw field names such as worth_your_time, filtered_out, jobs_found, or top_matches. If skip reasons are present, include them plainly.",
          user: JSON.stringify({ looked_at: stats.scanned, apply_now: recommended.length, worth_a_look: worth.length, filtered_out: stats.filtered_out, filter_breakdown: filteredCounts, reasons: allReasons, top_matches: recommended.map((j) => ({ title:j.title,company:j.company,salary:j.salary_range })), listings: rows.map((j) => ({title:j.title,company:j.company,salary:j.salary_range})) }),
        });
        finalSummary = sanitizeBriefingProse(generated.summary_text || "") || finalSummary;
        finalNotes = sanitizeBriefingProse(generated.market_notes || "") || finalNotes;
        brieferActor = "agent";
        brieferModel = aiModelName(config);
      } catch {}
    }
    briefingId = randomUUID();
    db.prepare("INSERT INTO briefings(id,user_id,briefing_date,generated_at,summary_text,market_notes,stats,recommended_job_ids,worth_a_look_job_ids,filtered_counts,pipeline_run_ids) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(briefingId, userId, sydneyDate(), new Date().toISOString(), finalSummary, finalNotes, JSON.stringify(stats), JSON.stringify(recommended.map((j)=>j.id)), JSON.stringify(worth.map((j)=>j.id)), JSON.stringify(filteredCounts), JSON.stringify(runIds));
    finishTraceStep(db, briefer.id, {
      inputs_summary: `Wrote the briefing from ${rows.length} listing${rows.length === 1 ? "" : "s"} in this run.`,
      outputs_summary: finalSummary,
      counts: { looked_at: rows.length, picks: recommended.length, worth_a_look: worth.length, filtered_out: Number(stats.filtered_out) },
    });
    if (brieferActor === "agent") {
      db.prepare("UPDATE run_trace_steps SET actor_type=?, model=? WHERE id=?").run("agent", brieferModel, briefer.id);
    }
    for (const job of recommended) {
      recordDecision(db, { traceId: trace.id, stepId: briefer.id, jobId: job.id, seekJobId: job.seek_job_id, title: job.title, company: job.company, stage: "briefer", decision: "picked", reason: "Included in the apply-now list as an A-grade role.", grade: job.grade, score: job.match_score });
    }
    for (const job of worth) {
      recordDecision(db, { traceId: trace.id, stepId: briefer.id, jobId: job.id, seekJobId: job.seek_job_id, title: job.title, company: job.company, stage: "briefer", decision: "worth_a_look", reason: "Included as worth a look (B-grade).", grade: job.grade, score: job.match_score });
    }

    const funnel: Funnel = { found: rows.length, passed_filters: kept, graded: scored, picks: recommended.length, worth_a_look: worth.length, dropped };
    const traceSummary = `${formatBriefingSummary(stats, filteredCounts, allReasons)} ${kept || dropped ? `${funnel.found} found → ${funnel.passed_filters} passed filters → ${funnel.graded} graded → ${funnel.picks} picks.` : ""}`.trim();
    finishRunTrace(db, trace.id, { status: "completed", briefingId, funnel, summaryText: traceSummary });
    const searches = results.map((result) => ({ name: result.name || null, jobs_found: result.jobs_found || 0, jobs_new: result.jobs_new || 0, skipped: uniqueSanitizedReasons(result.skipped || []) }));
    console.log(`[pipeline] ${profiles.length} search(es) ran, scanned=${stats.scanned}, reasons=${allReasons.join("; ") || "none"}`);
    return { totals: results.reduce((n, r) => n + (r.jobs_new || 0), 0), profiles: results.map(({ _profileId, ...rest }) => rest), briefing: stats, summary_text: finalSummary, market_notes: finalNotes, searches_run: profiles.length, searches_total: profiles.length, reasons: allReasons, searches, trace_id: trace.id, trace: loadLatestTrace(db, userId) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    finishRunTrace(db, trace.id, { status: "failed", briefingId, funnel: { found: 0, passed_filters: 0, graded: 0, picks: 0, worth_a_look: 0, dropped: 0 }, summaryText: message });
    throw error;
  }
}

const reasonLabels: Record<string,string> = { below_salary: "below your salary floor", contract: "contract or temporary", industry: "excluded industry", weak_fit: "a weaker fit" };

export function formatBriefingSummary(stats: { scanned: number; worth_your_time: number; filtered_out: number }, filteredCounts: Record<string, number>, reasons: string[]): string {
  const why = uniqueSanitizedReasons(reasons);
  if (stats.scanned === 0 && why.length) return `Nothing was added to this briefing: ${why.join("; ")}.`;
  const parts: string[] = [];
  parts.push(stats.scanned === 1 ? "This run looked at 1 listing." : `This run looked at ${stats.scanned} listings.`);
  if (stats.worth_your_time === 0) parts.push("None made the apply-now list.");
  else if (stats.worth_your_time === 1) parts.push("1 role is worth applying to.");
  else parts.push(`${stats.worth_your_time} roles are worth applying to.`);
  if (stats.filtered_out) {
    const breakdown = Object.entries(filteredCounts).map(([key, value]) => `${value} ${reasonLabels[key] || key}`).join(", ");
    parts.push(`${stats.filtered_out} ${stats.filtered_out === 1 ? "was" : "were"} filtered out${breakdown ? ` (${breakdown})` : ""}.`);
  }
  if (why.length) parts.push(why.join(" "));
  return parts.join(" ");
}

export function formatBriefingMarketNotes(listingsFound: number, reasons: string[]): string {
  const why = uniqueSanitizedReasons(reasons);
  if (!listingsFound && why.length) return `No listings were collected because ${why.join("; ")}.`;
  if (!listingsFound) return "No new listings met the search criteria in this run.";
  return "Your briefing prioritises senior, full-time roles at or above your salary floor.";
}
