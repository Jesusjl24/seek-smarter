import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrate.js";

export function openDatabase(filename: string) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("foreign_keys = ON"); db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}

export const jsonColumns = new Set(["skills_technical","skills_soft","education","certifications","previous_titles","industries","pros","cons","gaps","veto_reasons","scores","dealbreaker_hits","concerns","content","target_titles","target_industries","excluded_titles","locations","work_arrangements","work_types","mandatory_qualifications","dealbreakers","checklist","truth_check"]);
export function decodeRow<T = any>(row: any): T {
  if (!row) return row;
  const result = { ...row };
  for (const key of Object.keys(result)) if (jsonColumns.has(key) && typeof result[key] === "string") { try { result[key] = JSON.parse(result[key]); } catch {} }
  if ("active" in result) result.active = !!result.active;
  return result;
}
