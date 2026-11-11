import path from "node:path";

export type AiProvider = "xai" | "openai" | "gemini";

export interface Config {
  host: string; port: number; databasePath: string; uploadDir: string; jwtSecret: string;
  authAllowSignup: boolean; secureCookies: boolean; corsOrigin: string; agentToken?: string; agentUserId?: string;
  pipelineCron: string; pipelineCronTimezone?: string; aiProvider: AiProvider; openaiApiKey?: string;
  openaiBaseUrl: string; openaiModel: string; geminiApiKey?: string; geminiModel: string;
  xaiApiKey?: string; xaiBaseUrl: string; xaiModel: string;
  firecrawlApiKey?: string; nodeEnv: string;
}

function parseAiProvider(value?: string): AiProvider {
  const normalized = (value || "xai").toLowerCase();
  if (normalized === "openai") return "openai";
  if (normalized === "gemini") return "gemini";
  return "xai";
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
    pipelineCron: env.PIPELINE_CRON || "0 6 * * *", pipelineCronTimezone: env.PIPELINE_CRON_TZ || "Australia/Sydney", aiProvider: parseAiProvider(env.AI_PROVIDER),
    openaiApiKey: env.OPENAI_API_KEY, openaiBaseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    openaiModel: env.OPENAI_MODEL || "gpt-4o-mini", geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL || "gemini-2.0-flash",
    xaiApiKey: env.XAI_API_KEY, xaiBaseUrl: env.XAI_BASE_URL || "https://api.x.ai/v1",
    xaiModel: env.XAI_MODEL || "grok-4.3",
    firecrawlApiKey: env.FIRECRAWL_API_KEY,
    nodeEnv: env.NODE_ENV || "development",
  };
}

export function aiKeyName(config: Pick<Config, "aiProvider">): "XAI_API_KEY" | "OPENAI_API_KEY" | "GEMINI_API_KEY" {
  if (config.aiProvider === "openai") return "OPENAI_API_KEY";
  if (config.aiProvider === "gemini") return "GEMINI_API_KEY";
  return "XAI_API_KEY";
}

export function hasAiKey(config: Config): boolean {
  if (config.aiProvider === "openai") return !!config.openaiApiKey;
  if (config.aiProvider === "gemini") return !!config.geminiApiKey;
  return !!config.xaiApiKey;
}

export function aiModelName(config: Config): string {
  if (config.aiProvider === "openai") return config.openaiModel;
  if (config.aiProvider === "gemini") return config.geminiModel;
  return config.xaiModel;
}
