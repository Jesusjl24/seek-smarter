ALTER TABLE job_matches ADD COLUMN evidence_json TEXT;
ALTER TABLE job_matches ADD COLUMN criteria_json TEXT;

CREATE TABLE run_traces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  briefing_id TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  funnel_json TEXT NOT NULL DEFAULT '{}',
  summary_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX run_traces_user_started ON run_traces(user_id, started_at DESC);

CREATE TABLE run_trace_steps (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES run_traces(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  stage_label TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_name TEXT,
  model TEXT,
  started_at TEXT,
  finished_at TEXT,
  inputs_summary TEXT,
  outputs_summary TEXT,
  counts_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX run_trace_steps_trace ON run_trace_steps(trace_id, sort_order);

CREATE TABLE run_trace_decisions (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES run_traces(id) ON DELETE CASCADE,
  step_id TEXT,
  job_id TEXT,
  seek_job_id TEXT,
  title TEXT,
  company TEXT,
  stage TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  grade TEXT,
  score REAL,
  criteria_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX run_trace_decisions_trace ON run_trace_decisions(trace_id, stage);
CREATE INDEX run_trace_decisions_job ON run_trace_decisions(job_id);
