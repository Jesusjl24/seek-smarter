import type Database from "better-sqlite3";
import type { Config } from "../config.js";
import { runPipeline } from "./pipeline.js";

export type AgentRunStatus = "idle" | "running" | "completed" | "failed";

type RunState = {
  status: AgentRunStatus;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  last_start_ms: number;
};

const states = new Map<string, RunState>();
let cooldownMs = 5 * 60 * 1000;
let runner: typeof runPipeline = runPipeline;

function snapshot(state?: RunState) {
  if (!state) return { status: "idle" as const, started_at: null, completed_at: null, error: null };
  return { status: state.status, started_at: state.started_at, completed_at: state.completed_at, error: state.error };
}

export function getAgentRunStatus(userId: string) {
  return snapshot(states.get(userId));
}

export function startAgentRun(db: Database.Database, config: Config, userId: string, force = false): { ok: true; status: 202; body: any } | { ok: false; status: 409 | 429; body: any } {
  const current = states.get(userId);
  if (current?.status === "running") {
    return { ok: false, status: 409, body: { schema_version: "1.0", ...snapshot(current), error: "A pipeline run is already in progress" } };
  }
  const now = Date.now();
  if (current?.last_start_ms && now - current.last_start_ms < cooldownMs) {
    const retryAfter = Math.ceil((cooldownMs - (now - current.last_start_ms)) / 1000);
    return { ok: false, status: 429, body: { schema_version: "1.0", ...snapshot(current), error: "Pipeline runs are rate limited. Try again shortly.", retry_after_seconds: retryAfter } };
  }
  const started = new Date().toISOString();
  const next: RunState = { status: "running", started_at: started, completed_at: null, error: null, last_start_ms: now };
  states.set(userId, next);
  void runner(db, config, userId, force)
    .then(() => {
      const state = states.get(userId);
      if (!state || state.started_at !== started) return;
      state.status = "completed";
      state.completed_at = new Date().toISOString();
      state.error = null;
    })
    .catch((error) => {
      const state = states.get(userId);
      if (!state || state.started_at !== started) return;
      state.status = "failed";
      state.completed_at = new Date().toISOString();
      state.error = error instanceof Error ? error.message : "Pipeline run failed";
      console.error("[pipeline] agent run failed:", state.error);
    });
  return { ok: true, status: 202, body: { schema_version: "1.0", status: "started", started_at: started } };
}

export function configureAgentRun(options: { cooldownMs?: number; runner?: typeof runPipeline } = {}) {
  if (options.cooldownMs !== undefined) cooldownMs = options.cooldownMs;
  if (options.runner) runner = options.runner;
}

export function resetAgentRunState() {
  states.clear();
  cooldownMs = 5 * 60 * 1000;
  runner = runPipeline;
}
