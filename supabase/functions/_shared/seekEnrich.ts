export interface ScrapedJob {
  seek_job_id: string;
  title: string;
  company: string;
  location: string;
  salary_range?: string;
  work_type?: string;
  work_arrangement?: string;
  description_snippet: string;
  full_description?: string;
  job_url: string;
  date_posted?: string;
}

export function isValidJob(job: ScrapedJob): boolean {
  return /^\d+$/.test(job.seek_job_id) &&
    job.job_url.startsWith("https://www.seek.com.au/job/") &&
    !!job.title.trim() && !/^SEEK Job #\d+$/i.test(job.title) &&
    !!job.company.trim() && job.company !== "Unknown Company" &&
    !job.company.toLowerCase().includes("view on seek");
}

/** Keep enough of the real JD for scoring/drafting without sending an unbounded page. */
export function descriptionFromMarkdown(markdown: string, maxLength = 12_000): string {
  return markdown
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function parseJobDetailPage(jobId: string, markdown: string): ScrapedJob | null {
  const lines = markdown.split("\n").map((line) => line.trim()).filter(Boolean);
  let title = "";
  let company = "";
  let location = "";
  let salary_range: string | undefined;
  let work_type: string | undefined;
  let work_arrangement: string | undefined;
  let description_snippet = "";
  let date_posted: string | undefined;

  for (const line of lines) {
    const clean = line.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s*/, "").trim();
    if (!title && (line.startsWith("# ") || line.startsWith("## "))) {
      title = clean;
      continue;
    }
    if (!company && title && clean.length > 1 && clean.length < 100) {
      const skip = ["Apply", "Save", "Share", "Back", "Search", "Sign in", "Create", "Posted", "ago", "jobs", "Filter", "Sort", "More", "About", "Benefits", "Requirements", "Responsibilities", "Description", "Full details", "Job details", "How to apply", "Contact"];
      if (!skip.some((value) => clean.toLowerCase().includes(value.toLowerCase())) && /^[A-Z]/.test(clean) && !/^\d/.test(clean) && !clean.includes("http")) {
        company = clean;
        continue;
      }
    }
    if (!location) location = line.match(/\b(Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra|Hobart|Darwin|Gold Coast|Newcastle|Wollongong|Geelong|Townsville|Cairns|ACT|NSW|VIC|QLD|WA|SA|TAS|NT)(?:\s+CBD)?(?:\s*[,&]\s*[A-Za-z\s]+)?/i)?.[0]?.trim() ?? "";
    if (!salary_range) salary_range = line.match(/\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?(?:\s*(?:per|p\.?a\.?|annually|yearly|pa|k|per annum|per year))?/i)?.[0]?.trim();
    if (!work_type) work_type = line.match(/\b(Full[- ]?time|Part[- ]?time|Contract|Casual|Temporary|Permanent)\b/i)?.[0];
    if (!work_arrangement) work_arrangement = line.match(/\b(Remote|Hybrid|On[- ]?site|Work from home|WFH|Flexible)\b/i)?.[0];
    if (!date_posted) date_posted = line.match(/(?:Posted\s+)?(\d+[dh]?\s*(?:day|hour|minute)s?\s*ago|Just posted|Today|Yesterday|\d+[dh]\s*ago)/i)?.[1];
    if (!description_snippet && clean.length > 80 && clean.length < 500 && !/(©|Privacy|Terms|cookie)/i.test(clean)) description_snippet = clean;
  }
  if (!title) title = markdown.match(/^#+\s+(.+)$/m)?.[1]?.replace(/\*\*/g, "").trim() ?? "";
  if (title.length < 3) return null;
  if (company.length < 2) company = markdown.match(/(?:at|by|from)\s+([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\s+is|\s+in|\s*[-–]|\s*\n)/)?.[1]?.trim() ?? "";
  if (company.length < 2) return null;
  const full_description = descriptionFromMarkdown(markdown);
  return { seek_job_id: jobId, title, company, location: location || "Australia", salary_range, work_type, work_arrangement, description_snippet: description_snippet || full_description.slice(0, 450), full_description, job_url: `https://www.seek.com.au/job/${jobId}`, date_posted };
}

export async function scrapeJobDetails(jobId: string, apiKey: string): Promise<ScrapedJob | null> {
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ url: `https://www.seek.com.au/job/${jobId}`, formats: ["markdown"], waitFor: 2000, timeout: 15000, location: { country: "AU", languages: ["en-AU"] }, onlyMainContent: true }) });
    if (!response.ok) return null;
    const payload = await response.json();
    const markdown = String((payload.data || payload)?.markdown || "");
    if (markdown.length < 50) return null;
    const job = parseJobDetailPage(jobId, markdown);
    return job && isValidJob(job) ? job : null;
  } catch (error) {
    console.error(`[seek-enrich] Failed job ${jobId}`, error);
    return null;
  }
}

export async function enrichJobsFromIds(jobIds: string[], apiKey: string, limit: number): Promise<{ jobs: ScrapedJob[]; enrichedCount: number }> {
  const jobs: ScrapedJob[] = [];
  const ids = [...new Set(jobIds)].slice(0, Math.min(jobIds.length, limit + 5));
  for (let i = 0; i < ids.length && jobs.length < limit; i += 3) {
    const results = await Promise.all(ids.slice(i, i + 3).map((id) => scrapeJobDetails(id, apiKey)));
    for (const job of results) if (job && jobs.length < limit) jobs.push(job);
    if (i + 3 < ids.length && jobs.length < limit) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { jobs, enrichedCount: jobs.length };
}
