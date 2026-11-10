import type Database from "better-sqlite3";
import type { Config } from "../config.js";
import { runPipeline } from "./pipeline.js";

export type AgentRunStatus = "idle" | "running" | "completed" | "failed";

type SearchOutcome = { name: string | null; jobs_found: number; jobs_new: number; skipped: string[] };

type RunState = {
  status: AgentRunStatus;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  last_start_ms: number;
  searches_run: number | null;
  searches_total: number | null;
  reasons: string[] | null;
  searches: SearchOutcome[] | null;
  summary_text: string | null;
};

const states = new Map<string, RunState>();
let cooldownMs = 5 * 60 * 1000;
let runner: typeof runPipeline = runPipeline;

function snapshot(state?: RunState) {
  const empty = { searches_run: null as number | null, searches_total: null as number | null, reasons: null as string[] | null, searches: null as SearchOutcome[] | null, summary_text: null as string | null };
  if (!state) return { status: "idle" as const, started_at: null, completed_at: null, error: null, ...empty };
  return {
    status: state.status,
    started_at: state.started_at,
    completed_at: state.completed_at,
    error: state.error,
    searches_run: state.searches_run,
    searches_total: state.searches_total,
    reasons: state.reasons,
    searches: state.searches,
    summary_text: state.summary_text,
  };
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
  const next: RunState = { status: "running", started_at: started, completed_at: null, error: null, last_start_ms: now, searches_run: null, searches_total: null, reasons: null, searches: null, summary_text: null };
  states.set(userId, next);
  void runner(db, config, userId, force)
    .then((result: any) => {
      const state = states.get(userId);
      if (!state || state.started_at !== started) return;
      state.status = "completed";
      state.completed_at = new Date().toISOString();
      state.searches_run = result?.searches_run ?? result?.profiles?.length ?? 0;
      state.searches_total = result?.searches_total ?? state.searches_run;
      state.reasons = result?.reasons ?? [];
      state.searches = result?.searches ?? (result?.profiles || []).map((profile: any) => ({ name: profile.name ?? null, jobs_found: profile.jobs_found ?? 0, jobs_new: profile.jobs_new ?? 0, skipped: profile.skipped ?? [] }));
      state.summary_text = result?.summary_text ?? null;
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
