// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../src/db.js";
import { ensureOwnerDefaults } from "../src/lib/ownerDefaults.js";
import { deterministicFilter, parseSalaryFloor } from "../src/lib/dealbreakers.js";
import { loadConfig } from "../src/config.js";
import { seekSearchUrl, scrapeSeek } from "../src/lib/seekScrape.js";
import { createApp } from "../src/app.js";
import { runPipeline } from "../src/lib/pipeline.js";
import type { Config } from "../src/config.js";

const baseConfig: Config = {
  host: "127.0.0.1", port: 3100, databasePath: ":memory:", uploadDir: "/tmp/seek-smarter-test",
  jwtSecret: "test-secret-long-enough", authAllowSignup: true, secureCookies: false,
  corsOrigin: "http://localhost:8080", pipelineCron: "0 6 * * *", pipelineCronTimezone: "Australia/Sydney",
  aiProvider: "xai", openaiBaseUrl: "https://api.openai.com/v1", openaiModel: "test",
  geminiModel: "test", xaiBaseUrl: "https://api.x.ai/v1", xaiModel: "grok-4.3", nodeEnv: "test",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("briefing redesign", () => {
  it("seeds owner defaults and three searches idempotently", () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO users VALUES(?,?,?,?)").run("u1", "test@example.com", "hash", new Date().toISOString());
    ensureOwnerDefaults(db, "u1"); ensureOwnerDefaults(db, "u1");
    const prefs = db.prepare("SELECT * FROM candidate_preferences WHERE user_id='u1'").get() as any;
    expect(JSON.parse(prefs.target_titles)).toEqual(["Digital Transformation Lead", "Operations Manager", "CRM Manager"]);
    expect(prefs.salary_min).toBe(140000); expect(prefs.auto_generate_drafts).toBe(0);
    expect((db.prepare("SELECT count(*) count FROM search_profiles WHERE user_id='u1'").get() as any).count).toBe(3);
  });

  it("does not overwrite customised preferences or searches", () => {
    const db = openDatabase(":memory:"); const now = new Date().toISOString();
    db.prepare("INSERT INTO users VALUES(?,?,?,?)").run("u2", "custom@example.com", "hash", now);
    db.prepare("INSERT INTO candidate_preferences(user_id,target_titles,created_at,updated_at) VALUES(?,?,?,?)").run("u2", '["My role"]', now, now);
    db.prepare("INSERT INTO search_profiles(id,user_id,name,target_titles,locations,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run("s", "u2", "Custom", '["My role"]', "[]", 1, now, now);
    ensureOwnerDefaults(db, "u2");
    expect(JSON.parse((db.prepare("SELECT target_titles FROM candidate_preferences WHERE user_id='u2'").get() as any).target_titles)).toEqual(["My role"]);
    expect((db.prepare("SELECT count(*) count FROM search_profiles WHERE user_id='u2'").get() as any).count).toBe(1);
  });

  it("parses salary ranges and deterministically filters salary and contract", () => {
    expect(parseSalaryFloor("$135k - $165,000 + super")).toBe(135000);
    expect(deterministicFilter({ salary_range: "$120,000 - $150,000" }, { salary_min: 140000 }).reason).toBe("below_salary");
    expect(deterministicFilter({ work_type: "Contract/Temp" }, { salary_min: 140000 }).reason).toBe("contract");
    expect(deterministicFilter({ title: "CRM Manager", description_snippet: "Manage contractor onboarding", work_type: "Full time", salary_range: "$160,000" }, { salary_min: 140000 }).reason).toBeNull();
  });

  it("defaults the pipeline to 6am Sydney time", () => {
    const config = loadConfig({});
    expect(config.pipelineCron).toBe("0 6 * * *");
    expect(config.pipelineCronTimezone).toBe("Australia/Sydney");
  });

  it("builds SEEK URLs with salary and full-time filters and covers Sydney plus remote Australia", () => {
    const sydney = seekSearchUrl({ keywords: "Operations Manager", location: "Sydney", salaryMin: 140000, workType: "Full time" });
    expect(sydney).toContain("keywords=Operations+Manager");
    expect(sydney).toContain("where=Sydney");
    expect(sydney).toContain("salaryrange=140000-999999");
    expect(sydney).toContain("salarytype=annual");
    expect(sydney).toContain("worktype=242");
    expect(sydney).not.toContain("workarrangement");
    const remote = seekSearchUrl({ keywords: "Operations Manager", location: "Australia", salaryMin: 140000, workType: "Full time" });
    expect(remote).toContain("where=All+Australia");
    expect(remote).toContain("workarrangement=work-from-home");
  });

  it("discovers multiple locations without falling back to SEEK on Firecrawl auth errors", async () => {
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(typeof input === "string" ? input : input.url || input);
      if (url.includes("firecrawl.dev")) return new Response("nope", { status: 401 });
      return new Response("should not be called", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await scrapeSeek({ ...baseConfig, firecrawlApiKey: "bad" }, { keywords: "Operations Manager", locations: ["Sydney", "Australia"], salaryMin: 140000, workType: "Full time" });
    expect(result.jobs).toEqual([]);
    expect(result.diagnostics.message).toMatch(/Firecrawl key rejected/);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("seek.com.au"))).toBe(false);
  });

  it("writes a fallback briefing without an AI key and does not auto-draft", async () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO users VALUES(?,?,?,?)").run("u3", "brief@example.com", "hash", "now");
    ensureOwnerDefaults(db, "u3");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>", { status: 200 })));
    const result = await runPipeline(db, baseConfig, "u3", true);
    expect(result.briefing).toMatchObject({ scanned: 0 });
    expect(result.profiles.every((profile: any) => (profile.jobs_drafted ?? 0) === 0)).toBe(true);
    const briefing = db.prepare("SELECT * FROM briefings WHERE user_id='u3'").get() as any;
    expect(briefing.summary_text).toMatch(/Nothing was added to this briefing|listings scanned/);
    expect(result.reasons.join(" ")).toMatch(/FIRECRAWL_API_KEY for reliable scraping/);
    expect((db.prepare("SELECT count(*) count FROM document_revisions").get() as any).count).toBe(0);
  });

  it("keeps Firecrawl key rejection in the briefing and does not drop it as a non-blocking diagnostic", async () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO users VALUES(?,?,?,?)").run("owner", "owner@example.com", "hash", "now");
    const config = { ...baseConfig, firecrawlApiKey: "stub-key-xx" };
    vi.stubGlobal("fetch", vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("firecrawl.dev")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      return new Response("should not hit SEEK", { status: 200 });
    }));
    const result = await runPipeline(db, config, "owner", false);
    expect((db.prepare("SELECT count(*) c FROM search_profiles WHERE user_id='owner'").get() as any).c).toBe(3);
    expect(result.searches_run).toBe(3);
    expect(result.reasons.join(" ")).toMatch(/Firecrawl key rejected \(401\)/);
    expect(result.summary_text).toMatch(/Nothing was added to this briefing:.*Firecrawl key rejected \(401\)/);
    expect(result.profiles.every((profile: any) => (profile.skipped || []).some((item: string) => /Firecrawl key rejected/.test(item)))).toBe(true);
    expect(result.searches).toHaveLength(3);
  });

  it("exposes briefing APIs, feedback, restore, and the agent latest endpoint", async () => {
    const db = openDatabase(":memory:");
    const app = createApp({ db, config: baseConfig, agentToken: "agent-secret" });
    expect((await app.request("/api/briefings/latest")).status).toBe(401);
    expect((await app.request("/api/agent/briefing/latest")).status).toBe(401);
    const signup = await app.request("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner@example.com", password: "password123" }) });
    const cookie = signup.headers.get("set-cookie")!.split(";")[0];
    const userId = (db.prepare("SELECT id FROM users").get() as any).id;
    const now = new Date().toISOString();
    db.prepare("INSERT INTO jobs(id,user_id,seek_job_id,title,company,location,salary_range,description_snippet,job_url,date_scraped,pipeline_status,updated_at,filter_reason,auto_hidden_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("job-1", userId, "s1", "Operations Manager", "Acme", "Sydney", "$160,000", "Lead ops", "https://www.seek.com.au/job/1", now, "inbox", now, null, null);
    db.prepare("INSERT INTO jobs(id,user_id,seek_job_id,title,company,location,salary_range,description_snippet,job_url,date_scraped,pipeline_status,updated_at,filter_reason,auto_hidden_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("job-2", userId, "s2", "Low pay role", "Acme", "Sydney", "$100,000", "Too low", "https://www.seek.com.au/job/2", now, "not_fit", now, "below_salary", now);
    db.prepare("INSERT INTO job_matches(id,user_id,job_id,match_score,recommendation,scored_at,grade,why_apply,risks,chance_estimate) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run("m1", userId, "job-1", 90, "apply", now, "A", "Strong senior remit.", "Team is in flux.", "Good chance");
    db.prepare("INSERT INTO briefings(id,user_id,briefing_date,generated_at,summary_text,market_notes,stats,recommended_job_ids,worth_a_look_job_ids,filtered_counts,pipeline_run_ids) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run("b1", userId, "2026-11-10", now, "1 worth your time, 1 filtered out: 1 below salary.", "Salaries are holding.", JSON.stringify({ scanned: 2, worth_your_time: 1, filtered_out: 1 }), JSON.stringify(["job-1"]), "[]", JSON.stringify({ below_salary: 1 }), "[]");

    const latest = await app.request("/api/briefings/latest", { headers: { cookie } });
    expect(latest.status).toBe(200);
    const body = await latest.json();
    expect(body.summary_text).toMatch(/worth your time/);
    expect(body.recommendations[0]).toMatchObject({ id: "job-1", grade: "A", chance_estimate: "Good chance" });

    const feedback = await app.request("/api/jobs/job-1/feedback", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "not_for_me", reason: "too operational, not enough transformation" }) });
    expect(feedback.status).toBe(200);
    expect((db.prepare("SELECT reason FROM job_feedback WHERE job_id='job-1'").get() as any).reason).toMatch(/transformation/);
    expect((db.prepare("SELECT pipeline_status FROM jobs WHERE id='job-1'").get() as any).pipeline_status).toBe("not_fit");

    const restore = await app.request("/api/jobs/job-2/restore", { method: "POST", headers: { cookie } });
    expect(restore.status).toBe(200);
    expect((db.prepare("SELECT pipeline_status,filter_reason FROM jobs WHERE id='job-2'").get() as any)).toMatchObject({ pipeline_status: "inbox", filter_reason: null });

    const agent = await app.request("/api/agent/briefing/latest", { headers: { authorization: "Bearer agent-secret" } });
    expect(agent.status).toBe(200);
    const agentBody = await agent.json();
    expect(agentBody).toMatchObject({ schema_version: "1.0" });
    expect(agentBody.briefing.summary_text).toMatch(/worth your time/);
    expect(agentBody.recommendations[0].title).toBe("Operations Manager");
  });
});
