import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { aiKeyName, hasAiKey, type Config } from "../config.js";
import { scrapeSeek } from "./seekScrape.js";
import { scoreJob } from "./scoreJob.js";
import { isValidJob } from "./seekEnrich.js";
import { draftAGradePackages } from "./pipelineDrafts.js";
import { ensureOwnerDefaults } from "./ownerDefaults.js";
import { deterministicFilter } from "./dealbreakers.js";
import { chatJson } from "../ai.js";
import { decodeRow } from "../db.js";
import { uniqueSanitizedReasons } from "./providerErrors.js";
import { pipelineSearchGapMs } from "./firecrawl.js";

const sydneyDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function runPipeline(db: Database.Database, config: Config, userId: string, _force = false) {
  void _force; // reserved: runs do not skip on last_run_at
  ensureOwnerDefaults(db, userId);
  const prefs = decodeRow(db.prepare("SELECT * FROM candidate_preferences WHERE user_id=?").get(userId)) as any;
  const profiles = db.prepare("SELECT * FROM search_profiles WHERE user_id=? AND active=1").all(userId) as any[];
  const results: any[] = [];
  let packagesDrafted = 0;
  const touched = new Set<string>();
  const searchGap = pipelineSearchGapMs();
  for (const p of profiles) {
    if (results.length && searchGap) await new Promise((resolve) => setTimeout(resolve, searchGap));

    const id = randomUUID(), started = new Date().toISOString();
    db.prepare("INSERT INTO pipeline_runs(id,user_id,search_profile_id,status,started_at) VALUES(?,?,?,?,?)").run(id, userId, p.id, "running", started);
    let found = 0, added = 0, scored = 0, hidden = 0, strong = 0;
    const aGradeJobs: any[] = [];
    const reasons: string[] = [];
    try {
      const titles = JSON.parse(p.target_titles || "[]");
      if (!titles.length) {
        const message = "Search profile has no target titles";
        db.prepare("UPDATE pipeline_runs SET status='completed',completed_at=?,error=?,summary=? WHERE id=?").run(new Date().toISOString(), message, JSON.stringify({ skipped: [message] }), id);
        results.push({ id, status: "completed", name: p.name, jobs_found: 0, jobs_new: 0, jobs_scored: 0, skipped: [message] });
        continue;
      }
      const scraped = await scrapeSeek(config, { keywords: titles.slice(0, 3).join(" "), locations: JSON.parse(p.locations || "[]"), salaryMin: p.salary_min || prefs.salary_min, workType: "Full time", limit: 15 });
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
      for (const jobId of touched) {
        const candidate = db.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").get(jobId, userId) as any;
        const filter = deterministicFilter(candidate, prefs);
        if (filter.reason) db.prepare("UPDATE jobs SET pipeline_status='not_fit',triage_source='auto',auto_hidden_at=?,filter_reason=?,updated_at=? WHERE id=? AND user_id=?").run(new Date().toISOString(), filter.reason, new Date().toISOString(), jobId, userId);
      }
      if (!hasAiKey(config)) {
        if (found > 0) {
          reasons.push(`Scoring skipped: ${aiKeyName(config)} is not configured`);
          if (prefs.auto_generate_drafts) reasons.push(`Drafting skipped: ${aiKeyName(config)} is not configured`);
        }
      } else {
        const jobs = db.prepare("SELECT id FROM jobs WHERE user_id=? AND search_profile_id=? AND pipeline_status!='not_fit' AND id NOT IN (SELECT job_id FROM job_matches WHERE user_id=?) LIMIT 25").all(userId, p.id, userId) as any[];
        for (const job of jobs) {
          try {
            const match: any = await scoreJob(db, config, userId, job.id);
            scored++;
            if (match?.grade === "A") {
              strong++;
              const fullJob = db.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").get(job.id, userId) as any;
              if (fullJob) aGradeJobs.push({ ...fullJob, ...match });
            }
            if (match?.grade === "D" || (match?.match_score ?? 0) < (prefs.policy_review ?? 75)) {
              db.prepare("UPDATE jobs SET pipeline_status='not_fit',triage_source='auto',auto_hidden_at=?,filter_reason='weak_fit',updated_at=? WHERE id=? AND user_id=?").run(new Date().toISOString(), new Date().toISOString(), job.id, userId);
              hidden++;
            }
          } catch (e) {
            reasons.push(e instanceof Error ? e.message : "Scoring failed");
          }
        }
      }
      if (prefs.auto_generate_drafts && aGradeJobs.length && packagesDrafted < 3) {
        const drafts = await draftAGradePackages(db, config, userId, aGradeJobs, { limit: 3 - packagesDrafted });
        packagesDrafted += drafts.jobs_drafted;
        reasons.push(...drafts.skipped, ...drafts.errors.map((error) => `Draft generation failed: ${error}`));
      }
      const summary = { jobs_found: found, jobs_new: added, jobs_scored: scored, jobs_hidden: hidden, jobs_strong: strong, jobs_drafted: packagesDrafted, skipped: reasons };
      db.prepare("UPDATE pipeline_runs SET status='completed',completed_at=?,jobs_found=?,jobs_new=?,jobs_scored=?,summary=?,error=? WHERE id=?").run(new Date().toISOString(), found, added, scored, JSON.stringify(summary), reasons.join("; ") || null, id);
      db.prepare("UPDATE search_profiles SET last_run_at=?,updated_at=? WHERE id=? AND user_id=?").run(new Date().toISOString(), new Date().toISOString(), p.id, userId);
      results.push({ id, status: "completed", name: p.name, ...summary });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Pipeline failed";
      db.prepare("UPDATE pipeline_runs SET status='completed',completed_at=?,error=?,summary=? WHERE id=?").run(new Date().toISOString(), message, JSON.stringify({ skipped: [message] }), id);
      results.push({ id, status: "completed", name: p.name, jobs_found: found, jobs_new: added, jobs_scored: scored, skipped: [message] });
    }
  }
  if (!profiles.length) {
    results.push({ id: null, status: "completed", name: null, jobs_found: 0, jobs_new: 0, jobs_scored: 0, skipped: ["No active saved searches to run"] });
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
  if (hasAiKey(config) && rows.length) try { const generated: any = await chatJson(config, { system: "Write a concise morning job briefing. Return summary_text and market_notes. Do not invent facts. If skip reasons are present, include them plainly.", user: JSON.stringify({ stats, reasons: allReasons, top_matches: recommended.map((j) => ({ title:j.title,company:j.company,salary:j.salary_range })), listings: rows.map((j) => ({title:j.title,company:j.company,salary:j.salary_range})) }) }); finalSummary = generated.summary_text || finalSummary; finalNotes = generated.market_notes || finalNotes; } catch {}
  db.prepare("INSERT INTO briefings(id,user_id,briefing_date,generated_at,summary_text,market_notes,stats,recommended_job_ids,worth_a_look_job_ids,filtered_counts,pipeline_run_ids) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), userId, sydneyDate(), new Date().toISOString(), finalSummary, finalNotes, JSON.stringify(stats), JSON.stringify(recommended.map((j)=>j.id)), JSON.stringify(worth.map((j)=>j.id)), JSON.stringify(filteredCounts), JSON.stringify(runIds));
  const searches = results.map((result) => ({ name: result.name || null, jobs_found: result.jobs_found || 0, jobs_new: result.jobs_new || 0, skipped: uniqueSanitizedReasons(result.skipped || []) }));
  console.log(`[pipeline] ${profiles.length} search(es) ran, scanned=${stats.scanned}, reasons=${allReasons.join("; ") || "none"}`);
  return { totals: results.reduce((n, r) => n + (r.jobs_new || 0), 0), profiles: results, briefing: stats, summary_text: finalSummary, market_notes: finalNotes, searches_run: profiles.length, searches_total: profiles.length, reasons: allReasons, searches };
}

const reasonLabels: Record<string,string> = { below_salary: "below salary", contract: "contract", industry: "excluded industry", weak_fit: "weak fit" };

export function formatBriefingSummary(stats: { scanned: number; worth_your_time: number; filtered_out: number }, filteredCounts: Record<string, number>, reasons: string[]): string {
  const why = uniqueSanitizedReasons(reasons);
  if (stats.scanned === 0 && why.length) return `Nothing was added to this briefing: ${why.join("; ")}.`;
  const breakdown = Object.entries(filteredCounts).map(([key, value]) => `${value} ${reasonLabels[key] || key}`).join(", ");
  return `${stats.scanned} new listings scanned, ${stats.worth_your_time} worth your time, ${stats.filtered_out} filtered out${breakdown ? `: ${breakdown}` : ""}.`;
}

export function formatBriefingMarketNotes(listingsFound: number, reasons: string[]): string {
  const why = uniqueSanitizedReasons(reasons);
  if (!listingsFound && why.length) return `No listings were collected because ${why.join("; ")}.`;
  if (!listingsFound) return "No new listings met the search criteria in this run.";
  return "Your briefing prioritises senior, full-time roles at or above your salary floor.";
}
