import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import { scrapeSeek } from "./seekScrape.js";
import { scoreJob } from "./scoreJob.js";
import { isValidJob } from "./seekEnrich.js";
import { draftAGradePackages } from "./pipelineDrafts.js";

export async function runPipeline(db: Database.Database, config: Config, userId: string, force = false) {
  const profiles = db.prepare("SELECT * FROM search_profiles WHERE user_id=? AND active=1").all(userId) as any[];
  const results: any[] = [];
  let packagesDrafted = 0;
  for (const p of profiles) {
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
        results.push({ id, status: "completed", jobs_found: 0, jobs_new: 0, jobs_scored: 0, skipped: [message] });
        continue;
      }
      const scraped = await scrapeSeek(config, { keywords: titles.slice(0, 3).join(" "), location: JSON.parse(p.locations || "[]")[0], limit: 15 });
      found = scraped.jobs.length;
      if (scraped.diagnostics?.possible_blocking) reasons.push(scraped.diagnostics.message || "SEEK may be blocking automated requests");
      for (const job of scraped.jobs) {
        if (!isValidJob(job)) continue;
        const exists = db.prepare("SELECT id FROM jobs WHERE user_id=? AND seek_job_id=?").get(userId, job.seek_job_id) as any;
        if (!exists) {
          db.prepare("INSERT INTO jobs(id,user_id,seek_job_id,title,company,location,salary_range,work_type,work_arrangement,description_snippet,full_description,job_url,date_posted,date_scraped,pipeline_status,updated_at,search_profile_id,triage_source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .run(randomUUID(), userId, job.seek_job_id, job.title, job.company, job.location || "", job.salary_range || null, job.work_type || null, job.work_arrangement || null, job.description_snippet || "", job.full_description || null, job.job_url, job.date_posted || null, new Date().toISOString(), "inbox", new Date().toISOString(), p.id, "agent");
          added++;
        } else {
          db.prepare("UPDATE jobs SET title=?,company=?,location=?,salary_range=?,work_type=?,work_arrangement=?,description_snippet=?,full_description=?,job_url=?,updated_at=? WHERE id=? AND user_id=?")
            .run(job.title, job.company, job.location || "", job.salary_range || null, job.work_type || null, job.work_arrangement || null, job.description_snippet || "", job.full_description || null, job.job_url, new Date().toISOString(), exists.id, userId);
        }
      }
      if (!config.openaiApiKey && !config.geminiApiKey) {
        reasons.push(`Scoring skipped: ${config.aiProvider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} is not configured`);
        reasons.push(`Drafting skipped: ${config.aiProvider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} is not configured`);
      } else {
        const jobs = db.prepare("SELECT id FROM jobs WHERE user_id=? AND search_profile_id=? AND id NOT IN (SELECT job_id FROM job_matches WHERE user_id=?) LIMIT 25").all(userId, p.id, userId) as any[];
        for (const job of jobs) {
          try {
            const match: any = await scoreJob(db, config, userId, job.id);
            scored++;
            if (match?.grade === "A") {
              strong++;
              const fullJob = db.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").get(job.id, userId) as any;
              if (fullJob) aGradeJobs.push({ ...fullJob, ...match });
            }
            if (match?.grade === "D" || (match?.match_score ?? 0) < 75) {
              db.prepare("UPDATE jobs SET pipeline_status='not_fit',triage_source='auto',auto_hidden_at=?,updated_at=? WHERE id=? AND user_id=?").run(new Date().toISOString(), new Date().toISOString(), job.id, userId);
              hidden++;
            }
          } catch (e) {
            reasons.push(e instanceof Error ? e.message : "Scoring failed");
          }
        }
      }
      if (aGradeJobs.length && packagesDrafted < 3) {
        const drafts = await draftAGradePackages(db, config, userId, aGradeJobs, { limit: 3 - packagesDrafted });
        packagesDrafted += drafts.jobs_drafted;
        reasons.push(...drafts.skipped, ...drafts.errors.map((error) => `Draft generation failed: ${error}`));
      }
      const summary = { jobs_found: found, jobs_new: added, jobs_scored: scored, jobs_hidden: hidden, jobs_strong: strong, jobs_drafted: packagesDrafted, skipped: reasons };
      db.prepare("UPDATE pipeline_runs SET status='completed',completed_at=?,jobs_found=?,jobs_new=?,jobs_scored=?,summary=?,error=? WHERE id=?").run(new Date().toISOString(), found, added, scored, JSON.stringify(summary), reasons.join("; ") || null, id);
      db.prepare("UPDATE search_profiles SET last_run_at=?,updated_at=? WHERE id=? AND user_id=?").run(new Date().toISOString(), new Date().toISOString(), p.id, userId);
      results.push({ id, status: "completed", ...summary });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Pipeline failed";
      db.prepare("UPDATE pipeline_runs SET status='completed',completed_at=?,error=?,summary=? WHERE id=?").run(new Date().toISOString(), message, JSON.stringify({ skipped: [message] }), id);
      results.push({ id, status: "completed", jobs_found: found, jobs_new: added, jobs_scored: scored, skipped: [message] });
    }
  }
  return { totals: results.reduce((n, r) => n + (r.jobs_new || 0), 0), profiles: results };
}
