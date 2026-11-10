// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { scrapeSeek } from "../src/lib/seekScrape.js";
import { chatJson } from "../src/ai.js";
import { clearIntegrationsHealthCache } from "../src/lib/integrationsHealth.js";
import { setFirecrawlSleepForTests } from "../src/lib/firecrawl.js";

const baseConfig: Config = {
  host: "127.0.0.1", port: 3100, databasePath: ":memory:", uploadDir: "/tmp/seek-smarter-test",
  jwtSecret: "test-secret-long-enough", authAllowSignup: true, secureCookies: false,
  corsOrigin: "http://localhost:8080", pipelineCron: "off", aiProvider: "xai",
  openaiBaseUrl: "https://api.openai.com/v1", openaiModel: "test", geminiModel: "test",
  xaiBaseUrl: "https://api.x.ai/v1", xaiModel: "grok-4.3", nodeEnv: "test",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setFirecrawlSleepForTests();
  clearIntegrationsHealthCache();
});

describe("scrape diagnostics", () => {
  it("surfaces Firecrawl auth errors and does not fall back to SEEK", async () => {
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("firecrawl.dev")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      if (url.includes("seek.com.au")) return new Response("should not be called", { status: 200 });
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await scrapeSeek({ ...baseConfig, firecrawlApiKey: "test-firecrawl-key" }, { keywords: "operations manager", location: "Sydney" });
    expect(result.jobs).toEqual([]);
    expect(result.diagnostics.message).toBe("Firecrawl key rejected (401)");
    expect(result.diagnostics.status).toBe(401);
    expect(result.diagnostics.source).toBe("firecrawl");
    expect(result.diagnostics.possible_blocking).toBe(false);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("seek.com.au"))).toBe(false);
  });

  it("keeps a SEEK 403 message when no Firecrawl key is configured", async () => {
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("seek.com.au")) return new Response("blocked", { status: 403 });
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await scrapeSeek({ ...baseConfig, firecrawlApiKey: undefined }, { keywords: "operations manager", location: "Sydney" });
    expect(result.jobs).toEqual([]);
    expect(result.diagnostics.message).toMatch(/SEEK returned 403/);
    expect(result.diagnostics.possible_blocking).toBe(true);
    expect(result.diagnostics.status).toBe(403);
  });
});

describe("chatJson auth errors", () => {
  it("surfaces xAI key rejection for a 400 incorrect-key body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Incorrect API key provided. You can obtain an API key from https://console.x.ai." } }), { status: 400 })));
    await expect(chatJson({ ...baseConfig, xaiApiKey: "bad-key" }, { system: "Return JSON.", user: "ping" })).rejects.toThrow("xAI key rejected (400)");
  });
});

describe("GET /api/health/integrations", () => {
  it("requires auth and reports unconfigured keys without making test calls", async () => {
    const db = openDatabase(":memory:");
    const app = createApp({ db, config: baseConfig, agentToken: "agent-secret" });
    const anonymous = await app.request("/api/health/integrations");
    expect(anonymous.status).toBe(401);

    const signup = await app.request("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner@example.com", password: "password123" }) });
    const cookie = signup.headers.get("set-cookie")!.split(";")[0];
    const fetchMock = vi.fn(async () => new Response("should not be called", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await app.request("/api/health/integrations", { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.xai).toEqual({ configured: false, valid: null });
    expect(body.firecrawl).toEqual({ configured: false, valid: null });
    expect(typeof body.checked_at).toBe("string");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Firecrawl 429 retries", () => {
  it("retries a Firecrawl 429 and then succeeds", async () => {
    setFirecrawlSleepForTests(async () => {});
    let firecrawlCalls = 0;
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("firecrawl.dev")) {
        firecrawlCalls++;
        if (firecrawlCalls === 1) return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
        return new Response(JSON.stringify({ data: { markdown: "see /job/1234567", links: ["https://www.seek.com.au/job/1234567"] } }), { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await scrapeSeek({ ...baseConfig, firecrawlApiKey: "test-firecrawl-key" }, { keywords: "operations manager", location: "Sydney" });
    expect(firecrawlCalls).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics.status).not.toBe(429);
    expect(result.diagnostics.job_ids_found).toBe(1);
  });

  it("surfaces Firecrawl request failed (429) after retries are exhausted", async () => {
    setFirecrawlSleepForTests(async () => {});
    const fetchMock = vi.fn(async (input: any) => {
      if (String(input).includes("firecrawl.dev")) return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await scrapeSeek({ ...baseConfig, firecrawlApiKey: "test-firecrawl-key" }, { keywords: "operations manager", location: "Sydney" });
    expect(result.jobs).toEqual([]);
    expect(result.diagnostics.message).toBe("Firecrawl request failed (429)");
    expect(result.diagnostics.status).toBe(429);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("firecrawl.dev")).length).toBe(4);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("seek.com.au"))).toBe(false);
  });
});
