// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { setScrapeSeekForTests } from "../src/lib/pipeline.js";
import type { ScrapedJob } from "../src/lib/seekEnrich.js";
import { isValidJob } from "../src/lib/seekEnrich.js";
import { aggregatePreferences, learnedPreferenceAdjustment, recordJobFeedback } from "../src/lib/preferences.js";
import { scoreJob } from "../src/lib/scoreJob.js";
import { seekUrl } from "../src/lib/jobUrl.js";

const chatCalls: any[] = [];

vi.mock("../src/ai.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ai.js")>();
  return {
    ...actual,
    chatJson: vi.fn(async (_config: Config, req: { system: string; user: string }) => {
      chatCalls.push(req);
      if (String(req.system).includes("Summarise")) {
        return { like_summary: "You like operations leadership roles.", avoid_summary: "You avoid recruiter-posted roles.", memo_text: "You like operations leadership roles.\n\nYou avoid recruiter-posted roles." };
      }
      return {
        match_score: 82,
        recommendation: "apply",
        reasoning: "A strong fit.",
        why_apply: "The remit matches your resume.",
        risks: "None obvious.",
        chance_estimate: "Fair",
        criteria: {
          role_fit: { score: 80, note: "Lead remit", evidence: "transformation" },
          seniority: { score: 80, note: "Senior", evidence: "lead" },
          salary: { score: 80, note: "In band", evidence: "$165,000" },
          location: { score: 80, note: "Sydney", evidence: "Sydney" },
          skills: { score: 80, note: "CRM", evidence: "CRM" },
        },
        evidence: { resume_quotes: ["operations"], job_quotes: ["transformation"] },
      };
    }),
  };
});

function configWithUploads(uploadDir: string): Config {
  return {
    host: "127.0.0.1", port: 3100, databasePath: ":memory:", uploadDir,
    jwtSecret: "test-secret-long-enough", authAllowSignup: true, secureCookies: false,
    corsOrigin: "http://localhost:8080", pipelineCron: "off", aiProvider: "xai",
    openaiBaseUrl: "https://api.openai.com/v1", openaiModel: "test", geminiModel: "test",
    xaiBaseUrl: "https://api.x.ai/v1", xaiModel: "grok-4.3", nodeEnv: "test",
    firecrawlApiKey: "test-firecrawl-key", xaiApiKey: "test-xai-key",
  };
}

function listing(id: string, title: string, company: string, salary: string, workType = "Full time"): ScrapedJob {
  return {
    seek_job_id: id, title, company, location: "Sydney NSW", salary_range: salary, work_type: workType,
    work_arrangement: "Hybrid", description_snippet: "A senior leadership role in digital transformation.",
    full_description: "A senior leadership role in digital transformation with measurable outcomes.",
    job_url: `https://www.seek.com.au/job/${id}`,
  };
}

async function signup(app: ReturnType<typeof createApp>) {
  const response = await app.request("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner@example.com", password: "password123" }) });
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  return cookie;
}

describe("delete, links, and learning", () => {
  let uploadDir = "";
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof openDatabase>;
  let cookie = "";
  let config: Config;

  beforeEach(async () => {
    chatCalls.length = 0;
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "seek-smarter-uploads-"));
    config = configWithUploads(uploadDir);
    db = openDatabase(":memory:");
    app = createApp({ db, config, agentToken: "agent-secret" });
    cookie = await signup(app);
  });

  afterEach(() => {
    setScrapeSeekForTests();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  function userId() {
    return (db.prepare("SELECT id FROM users WHERE email='owner@example.com'").get() as any).id as string;
  }

  it("fills a missing SEEK url from the job id", () => {
    const job = listing("7654321", "Operations Manager", "Example Co", "$160,000");
    job.job_url = "";
    expect(isValidJob(job)).toBe(true);
    expect(job.job_url).toBe("https://www.seek.com.au/job/7654321");
    expect(seekUrl({ seek_job_id: "42" })).toBe("https://www.seek.com.au/job/42");
  });

  it("deletes an uploaded resume file and falls back to the upload-a-resume state", async () => {
    const relative = `${userId()}/abc/resume.pdf`;
    const full = path.join(uploadDir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "pdf-bytes");
    const saved = await app.request("/api/resume", {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ raw_text: "Operations leader with CRM and transformation experience.", file_path: relative, file_name: "resume.pdf", file_type: "application/pdf" }),
    });
    expect(saved.status).toBe(200);
    expect(fs.existsSync(full)).toBe(true);
    const profile = await saved.json();
    const del = await app.request(`/api/resume?id=${profile.id}`, { method: "DELETE", headers: { cookie } });
    expect(del.status).toBe(200);
    expect((await del.json()).active).toBeNull();
    expect(fs.existsSync(full)).toBe(false);
    expect((await (await app.request("/api/resume", { headers: { cookie } })).json())).toBeNull();
    const jobId = "job-score";
    db.prepare("INSERT INTO jobs(id,user_id,seek_job_id,title,company,location,description_snippet,job_url,date_scraped,pipeline_status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(jobId, userId(), "111", "Operations Manager", "Example Co", "Sydney", "Lead operations", "https://www.seek.com.au/job/111", "now", "inbox", "now");
    await expect(scoreJob(db, config, userId(), jobId)).rejects.toThrow(/upload a resume/i);
  });

  it("promotes the next most recent resume when the active one is deleted", async () => {
    await app.request("/api/resume", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ raw_text: "First resume: operations manager." }) });
    await app.request("/api/resume", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ raw_text: "Second resume: CRM lead." }) });
    const del = await app.request("/api/resume", { method: "DELETE", headers: { cookie } });
    const body = await del.json();
    expect(del.status).toBe(200);
    expect(body.promoted).toBe(true);
    expect(body.active.raw_text).toMatch(/operations manager/i);
    const current = await (await app.request("/api/resume", { headers: { cookie } })).json();
    expect(current.raw_text).toMatch(/operations manager/i);
  });

  it("deletes a tailored document and its file", async () => {
    const relative = `${userId()}/docs/letter.txt`;
    const full = path.join(uploadDir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "cover letter");
    const created = await app.request("/api/documents/generate", {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ document_type: "cover_letter", content: { body: "Hello" }, label: "Letter" }),
    });
    expect(created.status).toBe(200);
    const revision = (await created.json()).revision;
    db.prepare("UPDATE document_revisions SET storage_path=? WHERE id=?").run(relative, revision.id);
    const del = await app.request(`/api/documents/${revision.id}`, { method: "DELETE", headers: { cookie } });
    expect(del.status).toBe(200);
    expect(fs.existsSync(full)).toBe(false);
    const workspace = await (await app.request("/api/documents/workspace", { headers: { cookie } })).json();
    expect(workspace.coverLetters).toHaveLength(0);
  });

  it("persists like and dislike feedback and aggregates a preference profile", async () => {
    const uid = userId();
    for (const [id, title, company] of [
      ["job-like", "Operations Manager", "Example Co"],
      ["job-d1", "Junior Recruiter", "Interim Partners"],
      ["job-d2", "Talent Advisor", "Public Sector People"],
      ["job-d3", "Recruitment Consultant", "Hiring Partners"],
    ] as const) {
      db.prepare("INSERT INTO jobs(id,user_id,seek_job_id,title,company,location,salary_range,work_type,work_arrangement,description_snippet,job_url,date_scraped,pipeline_status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, uid, id, title, company, "Sydney", "$160,000", "Full time", "Hybrid", `${title} role`, `https://www.seek.com.au/job/${id}`, "now", "inbox", "now");
    }
    const like = await app.request("/api/jobs/job-like/feedback", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "like", chips: ["great fit"], note: "Right seniority" }) });
    expect(like.status).toBe(200);
    await app.request("/api/jobs/job-d1/feedback", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "dislike", chips: ["too junior"] }) });
    await app.request("/api/jobs/job-d2/feedback", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "dislike", chips: ["wrong industry"] }) });
    await app.request("/api/jobs/job-d3/feedback", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "dislike", chips: ["wrong industry"] }) });
    const row = db.prepare("SELECT action, reason, note, chips FROM job_feedback WHERE job_id='job-like'").get() as any;
    expect(row.action).toBe("like");
    expect(row.note).toBe("Right seniority");
    expect(String(row.chips)).toMatch(/great fit/);
    const aggregates = aggregatePreferences(db, uid);
    expect(aggregates.likes).toBe(1);
    expect(aggregates.dislikes).toBe(3);
    expect(aggregates.liked.titles).toContain("Operations Manager");
    expect(aggregates.disliked.companies).toEqual(expect.arrayContaining(["Interim Partners", "Public Sector People", "Hiring Partners"]));
    const adj = learnedPreferenceAdjustment({ title: "Talent Partner", company: "Hiring Partners", salary_range: "$160,000", work_arrangement: "Hybrid", description_snippet: "A recruiter role" }, aggregates);
    expect(adj.evidence).toMatch(/recruiter-posted/i);
    expect(adj.delta).toBeLessThan(0);
  });

  it("injects the learned preference memo into the matcher prompt and records a learned-preferences criterion", async () => {
    const uid = userId();
    await app.request("/api/resume", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ raw_text: "Operations leader." }) });
    db.prepare("INSERT INTO jobs(id,user_id,seek_job_id,title,company,location,salary_range,work_type,work_arrangement,description_snippet,job_url,date_scraped,pipeline_status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("job-grade", uid, "555", "Operations Manager", "Example Co", "Sydney", "$165,000", "Full time", "Hybrid", "Lead operations", "https://www.seek.com.au/job/555", "now", "inbox", "now");
    recordJobFeedback(db, uid, "job-grade", { action: "like", chips: ["great fit"] });
    await app.request("/api/learned-preferences/reset", { method: "POST", headers: { cookie } });
    const prefs = await (await app.request("/api/learned-preferences", { headers: { cookie } })).json();
    expect(prefs.memo_text).toMatch(/like/i);
    await scoreJob(db, config, uid, "job-grade");
    const prompt = chatCalls.find((item) => String(item.system).includes("Score this job"));
    expect(prompt).toBeTruthy();
    const payload = JSON.parse(prompt.user);
    expect(payload.learned_preferences_memo).toMatch(/like/i);
    expect(payload.recent_likes[0].title).toMatch(/Operations Manager/);
    const match = db.prepare("SELECT criteria_json FROM job_matches WHERE job_id='job-grade'").get() as any;
    const criteria = JSON.parse(match.criteria_json);
    expect(criteria.learned_preferences.label).toMatch(/Learned preferences/i);
    expect(criteria.learned_preferences.evidence || criteria.learned_preferences.note).toBeTruthy();
  });

  it("hides disliked jobs from briefings and includes SEEK urls in agent APIs and traces", async () => {
    const uid = userId();
    setScrapeSeekForTests(() => Promise.resolve({
      jobs: [listing("8888888", "Operations Manager", "Example Co", "$165,000")],
      diagnostics: { source: "firecrawl", job_ids_found: 1, jobs_enriched: 1, possible_blocking: false },
    }));
    db.prepare("UPDATE search_profiles SET active=0").run();
    await app.request("/api/search-profiles", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "Ops", target_titles: ["Operations Manager"], locations: ["Sydney"], salary_min: 140000 }) });
    const run = await app.request("/api/pipeline/run", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{\"force\":true}" });
    expect(run.status).toBe(200);
    const job = db.prepare("SELECT id, job_url FROM jobs WHERE seek_job_id='8888888'").get() as any;
    expect(job.job_url).toBe("https://www.seek.com.au/job/8888888");
    db.prepare("INSERT INTO job_matches(id,user_id,job_id,match_score,recommendation,scored_at,grade,why_apply) VALUES(?,?,?,?,?,?,?,?)")
      .run("match-1", uid, job.id, 90, "Apply", new Date().toISOString(), "A", "Strong fit");
    db.prepare("UPDATE jobs SET pipeline_status='inbox' WHERE id=?").run(job.id);
    const date = "2026-11-11";
    db.prepare("INSERT INTO briefings(id,user_id,briefing_date,generated_at,summary_text,market_notes,stats,recommended_job_ids,worth_a_look_job_ids,filtered_counts,pipeline_run_ids) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run("brief-1", uid, date, new Date().toISOString(), "One pick today.", "", JSON.stringify({}), JSON.stringify([job.id]), JSON.stringify([]), JSON.stringify({}), JSON.stringify([]));
    const before = await (await app.request("/api/briefings/latest", { headers: { cookie } })).json();
    expect(before.recommendations[0].job_url).toBe("https://www.seek.com.au/job/8888888");
    await app.request(`/api/jobs/${job.id}/feedback`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "dislike", chips: ["not for me"] }) });
    const after = await (await app.request("/api/briefings/latest", { headers: { cookie } })).json();
    expect(after.recommendations).toHaveLength(0);
    const agentMatches = await (await app.request("/api/agent/matches", { headers: { authorization: "Bearer agent-secret" } })).json();
    expect(agentMatches.matches).toHaveLength(0);
    const agentBriefing = await (await app.request("/api/agent/briefing/latest", { headers: { authorization: "Bearer agent-secret" } })).json();
    expect(agentBriefing.recommendations).toHaveLength(0);
    const trace = await (await app.request("/api/agent/runs/latest/trace", { headers: { authorization: "Bearer agent-secret" } })).json();
    expect(trace.trace.steps.some((step: any) => step.stage === "learner")).toBe(true);
    expect(trace.trace.decisions[0].job_url).toBe("https://www.seek.com.au/job/8888888");
    const agentFeedback = await app.request(`/api/agent/jobs/${job.id}/feedback`, { method: "POST", headers: { authorization: "Bearer agent-secret", "content-type": "application/json" }, body: JSON.stringify({ action: "like", chips: ["great fit"] }) });
    expect(agentFeedback.status).toBe(200);
    const agentPrefs = await (await app.request("/api/agent/preferences", { headers: { authorization: "Bearer agent-secret" } })).json();
    expect(agentPrefs.schema_version).toBe("1.0");
    expect(agentPrefs.recent.some((item: any) => item.job_id === job.id && item.action === "like")).toBe(true);
  });
});
