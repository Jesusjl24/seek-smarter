import path from "node:path";

export interface Config {
  host: string; port: number; databasePath: string; uploadDir: string; jwtSecret: string;
  authAllowSignup: boolean; secureCookies: boolean; corsOrigin: string; agentToken?: string; agentUserId?: string;
  pipelineCron: string; aiProvider: "openai" | "gemini"; openaiApiKey?: string;
  openaiBaseUrl: string; openaiModel: string; geminiApiKey?: string; geminiModel: string;
  firecrawlApiKey?: string; nodeEnv: string;
}

export function loadConfig(env = process.env): Config {
  return {
    host: env.HOST || "0.0.0.0", port: Number(env.PORT || 3100),
    databasePath: path.resolve(env.DATABASE_PATH || "./data/seek-smarter.db"),
    uploadDir: path.resolve(env.UPLOAD_DIR || "./data/uploads"),
    jwtSecret: env.JWT_SECRET || "development-only-change-me",
    authAllowSignup: (env.AUTH_ALLOW_SIGNUP || "true").toLowerCase() === "true",
    secureCookies: (env.COOKIE_SECURE || "").toLowerCase() === "true" || env.NODE_ENV === "production" && (env.PUBLIC_URL || "").startsWith("https:"),
    corsOrigin: env.CORS_ORIGIN || "http://localhost:8080", agentToken: env.AGENT_API_TOKEN, agentUserId: env.AGENT_USER_ID,
    pipelineCron: env.PIPELINE_CRON || "0 * * * *", aiProvider: env.AI_PROVIDER === "gemini" ? "gemini" : "openai",
    openaiApiKey: env.OPENAI_API_KEY, openaiBaseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    openaiModel: env.OPENAI_MODEL || "gpt-4o-mini", geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL || "gemini-2.0-flash", firecrawlApiKey: env.FIRECRAWL_API_KEY,
    nodeEnv: env.NODE_ENV || "development",
  };
}
