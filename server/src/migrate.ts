import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

export function runMigrations(db: Database.Database, directory = path.resolve("server/migrations")) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = db.prepare("SELECT name FROM schema_migrations").all().map((r: any) => r.name);
  for (const name of fs.readdirSync(directory).filter((f) => /^\d+.*\.sql$/.test(f)).sort()) {
    if (applied.includes(name)) continue;
    const sql = fs.readFileSync(path.join(directory, name), "utf8");
    db.transaction(() => { db.exec(sql); db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(name, new Date().toISOString()); })();
  }
}
