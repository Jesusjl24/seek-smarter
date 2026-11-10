import cron from "node-cron";
import type Database from "better-sqlite3";
import type { Config } from "./config.js";
import { runPipeline } from "./lib/pipeline.js";
export function startCron(db: Database.Database, config: Config) {
  if (config.pipelineCron.toLowerCase() === "off") return null;
  return cron.schedule(config.pipelineCron, async () => { console.log("[pipeline] scheduled run started"); const users=db.prepare("SELECT id FROM users").all() as Array<{id:string}>;for(const user of users)await runPipeline(db,config,user.id,false);console.log("[pipeline] scheduled run finished"); });
}
