/** Shared Firecrawl v1 scrape helper with retries for transient rate limits. */

const RETRYABLE = new Set([429, 502, 503, 504]);

export function retryDelayMs(response: Response, attempt: number, capMs = 20_000): number {
  const raw = response.headers.get("retry-after");
  const retryAfter = raw != null && raw !== "" ? Number(raw) : NaN;
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, capMs);
  return Math.min(1000 * 2 ** attempt, capMs);
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE.has(status);
}

async function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

let sleep = defaultSleep;

/** Test hook so retry cases do not wait on real backoff. */
export function setFirecrawlSleepForTests(fn?: (ms: number) => Promise<void>) {
  sleep = fn || defaultSleep;
}

export async function firecrawlScrape(apiKey: string, body: Record<string, unknown>, attempts = 4): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (last.ok || !RETRYABLE.has(last.status) || attempt === attempts - 1) return last;
    await last.arrayBuffer();
    await sleep(retryDelayMs(last, attempt));
  }
  return last!;
}

export function locationDiscoveryGapMs(): number {
  return process.env.VITEST ? 0 : 800;
}

export function pipelineSearchGapMs(): number {
  return process.env.VITEST ? 0 : 2000;
}
