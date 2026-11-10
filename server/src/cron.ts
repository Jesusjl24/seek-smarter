import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import type Database from "better-sqlite3";
import type { Config } from "./config.js";
import { runPipeline } from "./lib/pipeline.js";

let currentTask: ScheduledTask | null = null;

export function startCron(db: Database.Database, config: Config) {
  currentTask?.stop();
  currentTask = null;
  const expression = (db.prepare("SELECT value FROM app_settings WHERE key='pipeline_cron'").get() as any)?.value || config.pipelineCron;
  const timezone = (db.prepare("SELECT value FROM app_settings WHERE key='pipeline_timezone'").get() as any)?.value || config.pipelineCronTimezone || "Australia/Sydney";
  if (String(expression).toLowerCase() === "off") return null;
  if (!cron.validate(expression)) {
    console.error(`[pipeline] invalid cron expression: ${expression}`);
    return null;
  }
  currentTask = cron.schedule(expression, async () => {
    console.log("[pipeline] scheduled run started");
    const users = db.prepare("SELECT id FROM users").all() as Array<{ id: string }>;
    for (const user of users) await runPipeline(db, config, user.id, false);
    console.log("[pipeline] scheduled run finished");
  }, { timezone });
  return currentTask;
}

export function rescheduleCron(db: Database.Database, config: Config) {
  return startCron(db, config);
}
