ALTER TABLE job_feedback ADD COLUMN note TEXT;
ALTER TABLE job_feedback ADD COLUMN chips TEXT;
CREATE INDEX IF NOT EXISTS job_feedback_user_job ON job_feedback(user_id, job_id, created_at DESC);

CREATE TABLE preference_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  memo_text TEXT NOT NULL DEFAULT '',
  generated_memo TEXT NOT NULL DEFAULT '',
  like_summary TEXT NOT NULL DEFAULT '',
  avoid_summary TEXT NOT NULL DEFAULT '',
  aggregates_json TEXT NOT NULL DEFAULT '{}',
  user_edited INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  last_learned_at TEXT
);
