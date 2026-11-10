// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { configureAgentRun, resetAgentRunState } from "../src/lib/agentRun.js";
import type { Config } from "../src/config.js";

const config: Config = {
  host: "127.0.0.1", port: 3100, databasePath: ":memory:", uploadDir: "/tmp/seek-smarter-test",
  jwtSecret: "test-secret-long-enough", authAllowSignup: true, secureCookies: false,
  corsOrigin: "http://localhost:8080", pipelineCron: "off", pipelineCronTimezone: "Australia/Sydney",
  aiProvider: "xai", openaiBaseUrl: "https://api.openai.com/v1", openaiModel: "test",
  geminiModel: "test", xaiBaseUrl: "https://api.x.ai/v1", xaiModel: "grok-4.3", nodeEnv: "test",
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  resetAgentRunState();
});

describe("POST /api/agent/run", () => {
  it("requires the agent token and runs only for the bound owner", async () => {
    const db = openDatabase(":memory:");
    const app = createApp({ db, config, agentToken: "agent-secret" });
    expect((await app.request("/api/agent/run", { method: "POST" })).status).toBe(401);
    expect((await app.request("/api/agent/run", { method: "POST", headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await app.request("/api/agent/run/status")).status).toBe(401);

    const signup = await app.request("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner@example.com", password: "password123" }) });
    expect(signup.status).toBe(201);

    let resolveRun!: () => void;
    const running = new Promise<void>((resolve) => { resolveRun = resolve; });
    const runner = vi.fn(async () => { await running; return { totals: 0, profiles: [] }; });
    configureAgentRun({ cooldownMs: 50, runner: runner as any });

    const started = await app.request("/api/agent/run", { method: "POST", headers: { authorization: "Bearer agent-secret" }, body: "{}" });
    expect(started.status).toBe(202);
    expect(await started.json()).toMatchObject({ schema_version: "1.0", status: "started" });
    expect(runner).toHaveBeenCalledTimes(1);
    expect((runner.mock.calls[0] as any[])[2]).toBe((db.prepare("SELECT id FROM users").get() as any).id);

    const busy = await app.request("/api/agent/run", { method: "POST", headers: { "x-agent-token": "agent-secret" } });
    expect(busy.status).toBe(409);
    expect((await busy.json()).error).toMatch(/already in progress/i);

    const status = await (await app.request("/api/agent/run/status", { headers: { authorization: "Bearer agent-secret" } })).json();
    expect(status.status).toBe("running");

    resolveRun();
    await wait(20);
    const done = await (await app.request("/api/agent/run/status", { headers: { authorization: "Bearer agent-secret" } })).json();
    expect(done.status).toBe("completed");

    const limited = await app.request("/api/agent/run", { method: "POST", headers: { authorization: "Bearer agent-secret" } });
    expect(limited.status).toBe(429);
    const body = await limited.json();
    expect(body.retry_after_seconds).toBeGreaterThan(0);

    await wait(60);
    const again = await app.request("/api/agent/run", { method: "POST", headers: { authorization: "Bearer agent-secret" } });
    expect(again.status).toBe(202);
  });
});
