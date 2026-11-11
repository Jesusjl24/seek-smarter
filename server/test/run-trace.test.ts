// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { deterministicFilter } from "../src/lib/dealbreakers.js";
import { formatBriefingSummary, runPipeline, setScrapeSeekForTests } from "../src/lib/pipeline.js";
import type { ScrapedJob } from "../src/lib/seekEnrich.js";
import { normalizeCriteria } from "../src/lib/scoreJob.js";

const baseConfig: Config = {
  host: "127.0.0.1", port: 3100, databasePath: ":memory:", uploadDir: "/tmp/seek-smarter-test",
  jwtSecret: "test-secret-long-enough", authAllowSignup: true, secureCookies: false,
  corsOrigin: "http://localhost:8080", pipelineCron: "off", aiProvider: "xai",
  openaiBaseUrl: "https://api.openai.com/v1", openaiModel: "test", geminiModel: "test",
  xaiBaseUrl: "https://api.x.ai/v1", xaiModel: "grok-4.3", nodeEnv: "test",
  firecrawlApiKey: "test-firecrawl-key", xaiApiKey: "test-xai-key",
};

afterEach(() => setScrapeSeekForTests());

function listing(id: string, title: string, company: string, salary: string, workType = "Full time"): ScrapedJob {
  return {
    seek_job_id: id,
    title,
    company,
    location: "Sydney NSW",
    salary_range: salary,
    work_type: workType,
    work_arrangement: "Hybrid",
    description_snippet: "A senior leadership role in digital transformation.",
    full_description: "A senior leadership role in digital transformation with measurable outcomes.",
    job_url: `https://www.seek.com.au/job/${id}`,
  };
}

function fixtureScrape(_config: Config, input: any) {
  const keywords = String(input.keywords || "");
  if (/Digital/i.test(keywords)) {
    return Promise.resolve({
      jobs: [
        listing("1111111", "Digital Technical Lead", "Public Sector People", "$178,021-$203,376"),
        listing("2222222", "Transformation Lead", "Interim Partners", "$200,000-$220,000", "Contract"),
      ],
      diagnostics: { source: "firecrawl", job_ids_found: 2, jobs_enriched: 2, possible_blocking: false },
    });
  }
  if (/Operations/i.test(keywords)) {
    return Promise.resolve({
      jobs: [listing("3333333", "Operations Manager", "Example Co", "$130,000-$180,000")],
      diagnostics: { source: "firecrawl", job_ids_found: 1, jobs_enriched: 1, possible_blocking: false },
    });
  }
  return Promise.resolve({
    jobs: [],
    diagnostics: { source: "firecrawl", job_ids_found: 0, jobs_enriched: 0, possible_blocking: false, message: "Firecrawl request failed (429)", status: 429 },
  });
}

describe("filter reasons", () => {
  it("explains a below-salary drop with the listed salary text", () => {
    const result = deterministicFilter(
      { title: "Operations Manager", company: "Example Co", salary_range: "$130,000-$180,000", work_type: "Full time" },
      { salary_min: 140000 },
    );
    expect(result.reason).toBe("below_salary");
    expect(result.humanReason).toMatch(/\$130,000-\$180,000/);
    expect(result.humanReason).toMatch(/\$140,000/);
    expect(result.evidence.some((item) => item.kind === "salary" && item.text.includes("130,000"))).toBe(true);
  });

  it("explains a contract drop in plain language", () => {
    const result = deterministicFilter(
      { title: "Transformation Lead", company: "Interim Partners", salary_range: "$200,000-$220,000", work_type: "Contract" },
      { salary_min: 140000 },
    );
    expect(result.reason).toBe("contract");
    expect(result.humanReason).toMatch(/contract/i);
    expect(result.evidence[0]?.text).toMatch(/Contract/i);
  });

  it("does not say a full-time listing was dropped for being full time when the contract wording is in the ad", () => {
    const result = deterministicFilter(
      {
        title: "IT Delivery Lead",
        company: "Example",
        salary_range: "$200,000-$220,000",
        work_type: "Full time",
        full_description: "This is a contract role for a six-month transformation programme.",
      },
      { salary_min: 140000 },
    );
    expect(result.reason).toBe("contract");
    expect(result.humanReason).toMatch(/this is a contract role/i);
    expect(result.humanReason).not.toMatch(/this listing is full time/i);
    expect(result.evidence[0]?.text).toMatch(/this is a contract role/i);
  });
});

describe("briefing wording", () => {
  it("describes a run in plain language without raw field names", () => {
    const text = formatBriefingSummary(
      { scanned: 5, worth_your_time: 0, filtered_out: 2 },
      { below_salary: 1, contract: 1 },
      ["Upload a resume before scoring jobs"],
    );
    expect(text).toMatch(/looked at 5 listings/i);
    expect(text).toMatch(/apply-now list/i);
    expect(text).toMatch(/filtered out/i);
    expect(text).not.toMatch(/worth_your_time/);
    expect(text).not.toMatch(/filtered_out:/);
  });
});

describe("grading rationale shape", () => {
  it("normalizes a per-criterion breakdown and evidence labels", () => {
    const criteria = normalizeCriteria({
      role_fit: { score: 88, note: "Lead transformation remit", evidence: "own the digital transformation portfolio" },
      seniority: { score: 80, note: "Lead-level title" },
      salary: { score: 70, note: "Inside the target band", evidence: "$178,021-$203,376" },
    });
    expect(criteria.role_fit.label).toMatch(/Role fit/i);
    expect(criteria.salary.label).toMatch(/150,000/);
    expect(criteria.salary.evidence).toBe("$178,021-$203,376");
    expect(criteria.location.score).toBeNull();
  });
});

describe("run traces", () => {
  it("persists Scout and Gatekeeper decisions, including why a job was dropped", async () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO users VALUES(?,?,?,?)").run("owner", "owner@example.com", "hash", "now");
    setScrapeSeekForTests(fixtureScrape as any);
    const result = await runPipeline(db, baseConfig, "owner");
    expect(result.briefing.scanned).toBe(3);
    expect(result.briefing.filtered_out).toBe(2);
    expect(result.summary_text).not.toMatch(/worth_your_time/);
    expect(result.reasons.join(" ")).toMatch(/resume/i);

    const trace = result.trace;
    expect(trace).toBeTruthy();
    if (!trace) throw new Error("expected a persisted run trace");
    expect(trace.steps.map((step: any) => step.stage)).toEqual(["scout", "gatekeeper", "matcher", "skeptic", "briefer"]);
    expect(trace.steps[0].actor_type).toBe("script");
    expect(trace.steps[2].actor_type).toBe("agent");
    expect(trace.funnel.found).toBe(3);
    expect(trace.funnel.dropped).toBe(2);
    expect(trace.funnel.passed_filters).toBe(1);
    expect(trace.funnel.graded).toBe(0);
    expect(trace.steps[2].outputs_summary).toMatch(/no resume/i);

    const droppedSalary = trace.decisions.find((item: any) => item.decision === "dropped" && item.title === "Operations Manager");
    expect(droppedSalary).toBeTruthy();
    expect(droppedSalary?.reason).toMatch(/\$130,000-\$180,000/);
    expect(droppedSalary?.evidence.some((item: any) => item.kind === "salary")).toBe(true);

    const droppedContract = trace.decisions.find((item: any) => item.decision === "dropped" && /Interim/.test(item.company));
    expect(droppedContract).toBeTruthy();
    expect(droppedContract?.reason).toMatch(/contract/i);
  });

  it("exposes the latest trace through the agent API and a job decision trail", async () => {
    const db = openDatabase(":memory:");
    const app = createApp({ db, config: { ...baseConfig, xaiApiKey: undefined }, agentToken: "agent-secret" });
    const signup = await app.request("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner@example.com", password: "password123" }) });
    expect(signup.status).toBe(201);
    const cookie = signup.headers.get("set-cookie")!.split(";")[0];
    setScrapeSeekForTests(fixtureScrape as any);
    const user = db.prepare("SELECT id FROM users WHERE email=?").get("owner@example.com") as any;
    await runPipeline(db, { ...baseConfig, xaiApiKey: undefined }, user.id);

    expect((await app.request("/api/agent/runs/latest/trace")).status).toBe(401);
    const agent = await app.request("/api/agent/runs/latest/trace", { headers: { authorization: "Bearer agent-secret" } });
    expect(agent.status).toBe(200);
    const agentBody = await agent.json();
    expect(agentBody.trace.steps).toHaveLength(5);
    expect(agentBody.trace.funnel.found).toBe(3);
    expect(agentBody.trace.funnel_text).toMatch(/3 found/);

    const session = await app.request("/api/runs/latest/trace", { headers: { cookie } });
    expect(session.status).toBe(200);
    const sessionBody = await session.json();
    const dropped = sessionBody.trace.decisions.find((item: any) => item.decision === "dropped" && item.title === "Operations Manager");
    const trail = await app.request(`/api/jobs/${dropped.job_id}/decision-trail`, { headers: { cookie } });
    expect(trail.status).toBe(200);
    const trailBody = await trail.json();
    expect(trailBody.job.title).toBe("Operations Manager");
    expect(trailBody.stages.some((stage: any) => stage.stage === "gatekeeper" && stage.decision === "dropped")).toBe(true);
    expect(trailBody.stages[0].reason).toMatch(/\$130,000/);
  });
});
