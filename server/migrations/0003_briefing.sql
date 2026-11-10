ALTER TABLE candidate_preferences ADD COLUMN excluded_industries TEXT NOT NULL DEFAULT '[]';
ALTER TABLE candidate_preferences ADD COLUMN auto_generate_drafts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN filter_reason TEXT;
ALTER TABLE job_matches ADD COLUMN chance_estimate TEXT;

CREATE TABLE briefings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  briefing_date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  market_notes TEXT NOT NULL DEFAULT '',
  stats TEXT NOT NULL DEFAULT '{}',
  recommended_job_ids TEXT NOT NULL DEFAULT '[]',
  worth_a_look_job_ids TEXT NOT NULL DEFAULT '[]',
  filtered_counts TEXT NOT NULL DEFAULT '{}',
  pipeline_run_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX briefings_user_generated ON briefings(user_id, generated_at DESC);

CREATE TABLE job_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX job_feedback_user_created ON job_feedback(user_id, created_at DESC);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES('pipeline_cron','0 6 * * *',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES('pipeline_timezone','Australia/Sydney',datetime('now'));
