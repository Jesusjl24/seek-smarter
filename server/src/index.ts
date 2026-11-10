import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
import { startCron } from "./cron.js";

const config=loadConfig();
if(!process.env.JWT_SECRET){
  const secretPath=path.resolve("data/jwt-secret.txt");
  fs.mkdirSync(path.dirname(secretPath),{recursive:true});
  if(fs.existsSync(secretPath)) process.env.JWT_SECRET=fs.readFileSync(secretPath,"utf8").trim();
  else { const secret=randomBytes(32).toString("hex"); fs.writeFileSync(secretPath,secret,{mode:0o600}); fs.chmodSync(secretPath,0o600); process.env.JWT_SECRET=secret; console.log(`[auth] JWT secret written to ${secretPath}`); }
  Object.assign(config, loadConfig());
}
const db=openDatabase(config.databasePath);let agentToken=config.agentToken;
if(!agentToken){agentToken=randomBytes(32).toString("hex");const tokenPath=path.resolve("data/agent-token.txt");fs.mkdirSync(path.dirname(tokenPath),{recursive:true});fs.writeFileSync(tokenPath,agentToken,{mode:0o600});fs.chmodSync(tokenPath,0o600);console.log(`[agent] token written to ${tokenPath}`);}
const app=createApp({db,config,agentToken});
if(config.nodeEnv==="production"){app.use("/*",serveStatic({root:"./dist"}));app.get("/*",serveStatic({path:"./dist/index.html"}));}
startCron(db,config);serve({fetch:app.fetch,hostname:config.host,port:config.port},info=>console.log(`Seek Smarter listening on http://${info.address}:${info.port}`));
