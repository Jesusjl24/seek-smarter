import type { Config } from "../config.js";
import { peekErrorBody, providerErrorMessage } from "./providerErrors.js";

export type IntegrationStatus = { configured: boolean; valid: boolean | null; error?: string };
export type IntegrationsHealth = { checked_at: string; xai: IntegrationStatus; firecrawl: IntegrationStatus };

type CacheEntry = { at: number; xaiConfigured: boolean; firecrawlConfigured: boolean; result: IntegrationsHealth };
let cache: CacheEntry | null = null;
const TTL_MS = 10 * 60 * 1000;

async function checkXai(config: Config): Promise<IntegrationStatus> {
  const key = config.xaiApiKey?.trim();
  if (!key) return { configured: false, valid: null };
  const baseUrl = (config.xaiBaseUrl || "https://api.x.ai/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/models`, { headers: { authorization: `Bearer ${key}` } });
  if (response.ok) return { configured: true, valid: true };
  const body = await peekErrorBody(response);
  return { configured: true, valid: false, error: providerErrorMessage("xAI", response.status, body) };
}

async function checkFirecrawl(config: Config): Promise<IntegrationStatus> {
  const key = config.firecrawlApiKey?.trim();
  if (!key) return { configured: false, valid: null };
  // Cheap account/credits check; fall back to a second known path if the first is gone.
  let response = await fetch("https://api.firecrawl.dev/v1/team/credit-usage", { headers: { authorization: `Bearer ${key}` } });
  if (response.status === 404) {
    response = await fetch("https://api.firecrawl.dev/v2/team/credit-usage", { headers: { authorization: `Bearer ${key}` } });
  }
  if (response.ok) return { configured: true, valid: true };
  const body = await peekErrorBody(response);
  return { configured: true, valid: false, error: providerErrorMessage("Firecrawl", response.status, body) };
}

export async function getIntegrationsHealth(config: Config): Promise<IntegrationsHealth> {
  const xaiConfigured = !!config.xaiApiKey?.trim();
  const firecrawlConfigured = !!config.firecrawlApiKey?.trim();
  if (cache && Date.now() - cache.at < TTL_MS && cache.xaiConfigured === xaiConfigured && cache.firecrawlConfigured === firecrawlConfigured) {
    return cache.result;
  }
  const [xai, firecrawl] = await Promise.all([checkXai(config), checkFirecrawl(config)]);
  const result: IntegrationsHealth = { checked_at: new Date().toISOString(), xai, firecrawl };
  cache = { at: Date.now(), xaiConfigured, firecrawlConfigured, result };
  return result;
}

export function clearIntegrationsHealthCache() { cache = null; }
