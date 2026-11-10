import type { Config } from "../config.js";
import { enrichJobsFromIdsWithFallback, type ScrapedJob } from "./seekEnrich.js";

const UA = "Mozilla/5.0 (compatible; SeekSmarter/1.0; self-hosted job search)";

function extractIds(text: string): string[] {
  return [...new Set([...text.matchAll(/(?:job|jobs)\/(\d{6,})/gi)].map((m) => m[1]))];
}

async function discoverIds(config: Config, input: any): Promise<{ ids: string[]; source: string; message?: string }> {
  const query = new URLSearchParams();
  if (input.keywords) query.set("keywords", input.keywords);
  if (input.location) query.set("where", input.location);
  const url = `https://www.seek.com.au/jobs?${query}`;
  const limit = Number(input.jobLimit || input.limit || 20);

  if (config.firecrawlApiKey) {
    const firecrawl = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { authorization: `Bearer ${config.firecrawlApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown", "links"], waitFor: 2500, timeout: 30000, location: { country: "AU", languages: ["en-AU"] }, onlyMainContent: true }),
    });
    if (firecrawl.ok) {
      const payload: any = await firecrawl.json();
      const data = payload.data || payload;
      const text = `${data.markdown || ""} ${(data.links || []).join(" ")}`;
      const ids = extractIds(text).slice(0, limit);
      return { ids, source: "firecrawl", message: ids.length ? undefined : "Firecrawl returned no parseable SEEK links." };
    }
  }

  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`SEEK returned ${response.status}`);
  const ids = extractIds(await response.text()).slice(0, limit);
  return {
    ids,
    source: config.firecrawlApiKey ? "direct_fallback" : "direct",
    message: ids.length ? undefined : "SEEK returned no parseable job links; it may be blocking automated requests.",
  };
}

export async function scrapeSeek(config: Config, input: any): Promise<{ jobs: ScrapedJob[]; diagnostics: any }> {
  try {
    const discovered = await discoverIds(config, input);
    const cap = Math.min(8, Number(input.jobLimit || input.limit || 8));
    const { jobs, enrichedCount } = await enrichJobsFromIdsWithFallback(discovered.ids, config.firecrawlApiKey, cap);
    return {
      jobs,
      diagnostics: {
        source: discovered.source,
        job_ids_found: discovered.ids.length,
        jobs_enriched: enrichedCount,
        possible_blocking: discovered.ids.length === 0,
        message: jobs.length ? undefined : discovered.message || "Job IDs were found but detail pages could not be enriched.",
      },
    };
  } catch (error) {
    return { jobs: [], diagnostics: { possible_blocking: true, message: error instanceof Error ? error.message : "SEEK request failed" } };
  }
}
