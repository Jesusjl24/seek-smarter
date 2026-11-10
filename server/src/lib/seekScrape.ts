import type { Config } from "../config.js";
import { enrichJobsFromIdsWithFallback, type ScrapedJob } from "./seekEnrich.js";
import { peekErrorBody, providerErrorMessage, ProviderRequestError } from "./providerErrors.js";
import { firecrawlScrape, locationDiscoveryGapMs } from "./firecrawl.js";

const UA = "Mozilla/5.0 (compatible; SeekSmarter/1.0; self-hosted job search)";

function extractIds(text: string): string[] {
  return [...new Set([...text.matchAll(/(?:job|jobs)\/(\d{6,})/gi)].map((m) => m[1]))];
}

function isRemoteLocation(location?: string) {
  return /remote|work from home|all australia|^australia$/i.test(String(location || "").trim());
}

export function seekSearchUrl(input: any): string {
  const query = new URLSearchParams();
  if (input.keywords) query.set("keywords", input.keywords);
  const remote = isRemoteLocation(input.location) || String(input.workArrangement || "").toLowerCase().includes("remote");
  if (remote) {
    query.set("where", "All Australia");
    // SEEK uses work-from-home for remote listings.
    query.set("workarrangement", "work-from-home");
  } else if (input.location) {
    query.set("where", input.location);
  }
  if (input.salaryMin) { query.set("salaryrange", `${Number(input.salaryMin)}-999999`); query.set("salarytype", "annual"); }
  // SEEK worktype=242 is full time; 244 is contract/temp and is intentionally excluded.
  if (String(input.workType || "").toLowerCase().includes("full")) query.set("worktype", "242");
  return `https://www.seek.com.au/jobs?${query}`;
}

export async function discoverIds(config: Config, input: any): Promise<{ ids: string[]; source: string; message?: string }> {
  const url = seekSearchUrl(input);
  const limit = Number(input.jobLimit || input.limit || 20);

  if (config.firecrawlApiKey) {
    const firecrawl = await firecrawlScrape(config.firecrawlApiKey, { url, formats: ["markdown", "links"], waitFor: 2500, timeout: 30000, location: { country: "AU", languages: ["en-AU"] }, onlyMainContent: true });
    if (!firecrawl.ok) {
      const body = await peekErrorBody(firecrawl);
      throw new ProviderRequestError(providerErrorMessage("Firecrawl", firecrawl.status, body), { status: firecrawl.status, source: "firecrawl", possibleBlocking: false });
    }
    const payload: any = await firecrawl.json();
    const data = payload.data || payload;
    const text = `${data.markdown || ""} ${(data.links || []).join(" ")}`;
    const ids = extractIds(text).slice(0, limit);
    return { ids, source: "firecrawl", message: ids.length ? undefined : "Firecrawl returned no parseable SEEK links." };
  }

  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow" });
  if (!response.ok) {
    throw new ProviderRequestError(`SEEK returned ${response.status}. Configure FIRECRAWL_API_KEY for reliable scraping.`, { status: response.status, source: "direct", possibleBlocking: true });
  }
  const ids = extractIds(await response.text()).slice(0, limit);
  return {
    ids,
    source: "direct",
    message: ids.length ? undefined : "SEEK returned no parseable job links; it may be blocking automated requests. Configure FIRECRAWL_API_KEY for reliable scraping.",
  };
}

export async function scrapeSeek(config: Config, input: any): Promise<{ jobs: ScrapedJob[]; diagnostics: any }> {
  try {
    const locations: string[] = input.locations?.length ? input.locations : [input.location].filter(Boolean);
    const targets = locations.length ? locations : [undefined];
    const discoveries = [];
    const gap = locationDiscoveryGapMs();
    for (const location of targets) {
      if (discoveries.length && gap) await new Promise((resolve) => setTimeout(resolve, gap));
      discoveries.push(await discoverIds(config, { ...input, location, workArrangement: isRemoteLocation(location) ? "remote" : undefined }));
    }
    const discovered = { ids: [...new Set(discoveries.flatMap((item) => item.ids))], source: discoveries.map((item) => item.source).join("+"), message: [...new Set(discoveries.map((item) => item.message).filter(Boolean))].join(" ") || undefined };
    const cap = Math.min(8, Number(input.jobLimit || input.limit || 8));
    const { jobs, enrichedCount } = await enrichJobsFromIdsWithFallback(discovered.ids, config.firecrawlApiKey, cap);
    return {
      jobs,
      diagnostics: {
        source: discovered.source,
        job_ids_found: discovered.ids.length,
        jobs_enriched: enrichedCount,
        possible_blocking: discovered.ids.length === 0 && discovered.source !== "firecrawl",
        message: jobs.length ? undefined : discovered.message || "Job IDs were found but detail pages could not be enriched.",
      },
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return {
        jobs: [],
        diagnostics: {
          source: error.source,
          provider: error.source === "firecrawl" ? "firecrawl" : undefined,
          status: error.status,
          possible_blocking: error.possibleBlocking,
          message: error.message,
        },
      };
    }
    return { jobs: [], diagnostics: { possible_blocking: true, message: error instanceof Error ? error.message : "SEEK request failed" } };
  }
}
