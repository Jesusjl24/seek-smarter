import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export const OWNER_TITLES = ["Digital Transformation Lead", "Operations Manager", "CRM Manager"];

export function ensureOwnerDefaults(db: Database.Database, userId: string) {
  const now = new Date().toISOString();
  const hasPreferences = db.prepare("SELECT 1 FROM candidate_preferences WHERE user_id=?").get(userId);
  if (!hasPreferences) {
    db.prepare(`INSERT INTO candidate_preferences(
      user_id,job_goals,career_direction,target_titles,target_industries,excluded_titles,
      salary_min,salary_target,currency,locations,work_arrangements,work_types,
      mandatory_qualifications,dealbreakers,verified_experience,policy_strong,policy_review,
      excluded_industries,auto_generate_drafts,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      userId,
      "Senior or lead-level transformation, operations, or CRM role. Penalise junior and mid-level roles. Ideal salary band AUD 150,000–180,000.",
      "Senior leadership scope with meaningful ownership and measurable transformation outcomes.",
      JSON.stringify(OWNER_TITLES), "[]", "[]", 140000, 165000, "AUD", JSON.stringify(["Sydney"]),
      JSON.stringify(["Remote", "Hybrid", "On-site"]), JSON.stringify(["Full time"]), "[]", "[]", null,
      80, 75, "[]", 0, now, now,
    );
  }
  const hasSearch = db.prepare("SELECT 1 FROM search_profiles WHERE user_id=? LIMIT 1").get(userId);
  if (!hasSearch) {
    const insert = db.prepare("INSERT INTO search_profiles(id,user_id,name,target_titles,locations,salary_min,active,last_run_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)");
    for (const title of OWNER_TITLES) insert.run(randomUUID(), userId, title, JSON.stringify([title]), JSON.stringify(["Sydney", "Australia"]), 140000, 1, null, now, now);
  }
}

export function backfillOwnerDefaults(db: Database.Database) {
  const users = db.prepare("SELECT id FROM users").all() as Array<{ id: string }>;
  for (const user of users) ensureOwnerDefaults(db, user.id);
}
