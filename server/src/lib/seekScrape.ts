import type { Config } from "../config.js";
export async function scrapeSeek(config: Config, input: any) {
  const query = new URLSearchParams(); if (input.keywords) query.set("keywords", input.keywords); if (input.location) query.set("where", input.location);
  const url = `https://www.seek.com.au/jobs?${query}`;
  try {
    if (config.firecrawlApiKey) {
      const firecrawl = await fetch("https://api.firecrawl.dev/v1/scrape", { method: "POST", headers: { authorization: `Bearer ${config.firecrawlApiKey}`, "content-type": "application/json" }, body: JSON.stringify({ url, formats: ["markdown"] }) });
      if (firecrawl.ok) {
        const payload: any = await firecrawl.json(); const text = payload.data?.markdown || payload.markdown || ""; const ids = [...text.matchAll(/(?:job|jobs)\/(\d{6,})/g)].map((m) => m[1]); const unique = [...new Set(ids)].slice(0, Number(input.jobLimit || input.limit || 20));
        return { jobs: unique.map((id) => ({ seek_job_id: id, title: `SEEK Job #${id}`, company: "View on SEEK", location: input.location || "", description_snippet: "Open this role on SEEK for details.", job_url: `https://www.seek.com.au/job/${id}` })), diagnostics: { source: "firecrawl", possible_blocking: unique.length === 0, message: unique.length ? undefined : "Firecrawl returned no parseable SEEK links." } };
      }
    }
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; SeekSmarter/1.0; self-hosted)" } });
    if (!response.ok) throw new Error(`SEEK returned ${response.status}`); const html = await response.text(); const ids = [...html.matchAll(/(?:job|jobs)\/(\d{6,})/g)].map((m) => m[1]);
    const unique = [...new Set(ids)].slice(0, Number(input.jobLimit || input.limit || 20));
    return { jobs: unique.map((id) => ({ seek_job_id: id, title: `SEEK Job #${id}`, company: "View on SEEK", location: input.location || "", description_snippet: "Open this role on SEEK for details.", job_url: `https://www.seek.com.au/job/${id}` })), diagnostics: { source: config.firecrawlApiKey ? "direct_fallback" : "direct", possible_blocking: unique.length === 0, message: unique.length ? undefined : "SEEK returned no parseable job links; it may be blocking automated requests." } };
  } catch (error) { return { jobs: [], diagnostics: { possible_blocking: true, message: error instanceof Error ? error.message : "SEEK request failed" } }; }
}
