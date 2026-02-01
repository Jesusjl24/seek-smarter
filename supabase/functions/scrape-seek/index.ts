/**
 * SEEK Job Scraper Edge Function
 * 
 * Expected Request JSON:
 * {
 *   "keywords": "Project Manager",      // required
 *   "location": "Sydney",               // optional
 *   "filters": {                        // optional
 *     "workType": "full-time",          // full-time, part-time, contract, casual
 *     "workArrangement": "remote",      // on-site, hybrid, remote
 *     "salaryMin": "100000",
 *     "salaryMax": "150000",
 *     "salaryType": "annual",           // annual, monthly, hourly
 *     "datePosted": "7"                 // days: 1, 3, 7, 14, 30
 *   },
 *   "limit": 20                         // 1-50, default 20 (string or number)
 * }
 * 
 * Required Environment Variable:
 *   FIRECRAWL_API_KEY - Your Firecrawl API key
 * 
 * Test with curl:
 *   curl -X POST https://<project>.supabase.co/functions/v1/scrape-seek \
 *     -H "Content-Type: application/json" \
 *     -H "Authorization: Bearer <anon-key>" \
 *     -d '{"keywords":"Software Engineer","location":"Melbourne","limit":10}'
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScrapedJob {
  seek_job_id: string;
  title: string;
  company: string;
  location: string;
  salary_range?: string;
  work_type?: string;
  work_arrangement?: string;
  description_snippet: string;
  job_url: string;
  date_posted?: string;
}

interface DiagnosticInfo {
  message: string;
  url_scraped?: string;
  firecrawl_status?: number;
  markdown_length?: number;
  job_ids_found?: number;
  jobs_enriched?: number;
  possible_blocking?: boolean;
  raw_sample?: string;
  parsing_method?: string;
}

// Helper: create a JSON response with CORS headers
function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Helper: parse and clamp limit to [1, 50], default 20
function parseLimit(input: unknown): number {
  if (input === null || input === undefined) return 20;
  
  let num: number;
  if (typeof input === 'number') {
    num = input;
  } else if (typeof input === 'string') {
    num = parseInt(input, 10);
  } else {
    return 20;
  }
  
  if (isNaN(num) || !isFinite(num)) return 20;
  return Math.min(Math.max(Math.floor(num), 1), 50);
}

// Helper: check if a job is a valid, non-placeholder job
function isValidJob(job: ScrapedJob): boolean {
  // Must have numeric seek_job_id
  if (!job.seek_job_id || !/^\d+$/.test(job.seek_job_id)) return false;
  
  // Must have valid URL
  if (!job.job_url || !job.job_url.startsWith('https://www.seek.com.au/job/')) return false;
  
  // Title must not be empty or placeholder
  if (!job.title || job.title.trim() === '') return false;
  if (/^SEEK Job #\d+$/i.test(job.title)) return false;
  
  // Company must not be empty or placeholder
  if (!job.company || job.company.trim() === '') return false;
  if (job.company.toLowerCase().includes('view on seek')) return false;
  if (job.company === 'Unknown Company') return false;
  
  return true;
}

// Helper: scrape individual job detail page to get real metadata
async function scrapeJobDetails(jobId: string, apiKey: string): Promise<ScrapedJob | null> {
  const jobUrl = `https://www.seek.com.au/job/${jobId}`;
  console.log(`[scrape-seek] Enriching job ${jobId}...`);
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: jobUrl,
        formats: ['markdown'],
        waitFor: 2000,
        timeout: 15000,
        location: {
          country: 'AU',
          languages: ['en-AU']
        },
        onlyMainContent: true,
      }),
    });

    if (!response.ok) {
      console.warn(`[scrape-seek] Failed to fetch job ${jobId}: HTTP ${response.status}`);
      return null;
    }

    const scrapeData = await response.json();
    const data = scrapeData.data || scrapeData;
    const markdown = data?.markdown || '';
    
    if (!markdown || markdown.length < 50) {
      console.warn(`[scrape-seek] No content for job ${jobId}`);
      return null;
    }

    // Parse job details from the detail page markdown
    const job = parseJobDetailPage(jobId, markdown);
    
    if (job && isValidJob(job)) {
      console.log(`[scrape-seek] Successfully enriched job ${jobId}: "${job.title}" at "${job.company}"`);
      return job;
    }
    
    console.warn(`[scrape-seek] Could not extract valid data for job ${jobId}`);
    return null;
  } catch (error) {
    console.error(`[scrape-seek] Error enriching job ${jobId}:`, error);
    return null;
  }
}

// Helper: parse a job detail page markdown to extract job info
function parseJobDetailPage(jobId: string, markdown: string): ScrapedJob | null {
  const lines = markdown.split('\n').map(l => l.trim()).filter(l => l);
  
  let title = '';
  let company = '';
  let location = '';
  let salary_range: string | undefined;
  let work_type: string | undefined;
  let work_arrangement: string | undefined;
  let description_snippet = '';
  let date_posted: string | undefined;
  
  // Job detail pages typically have:
  // # Job Title (first h1)
  // Company name (often on its own line after title)
  // Location info
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanLine = line.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/, '').trim();
    
    // First major heading is usually the job title
    if (!title && (line.startsWith('# ') || line.startsWith('## '))) {
      title = cleanLine;
      continue;
    }
    
    // Look for company - often appears right after title or in specific patterns
    if (!company && title && cleanLine.length > 1 && cleanLine.length < 100) {
      // Skip navigation items and common non-company text
      const skipPatterns = [
        'Apply', 'Save', 'Share', 'Back', 'Search', 'Sign in', 'Create', 
        'Posted', 'ago', 'jobs', 'Filter', 'Sort', 'More', 'About', 
        'Benefits', 'Requirements', 'Responsibilities', 'Description',
        'Full details', 'Job details', 'How to apply', 'Contact'
      ];
      
      if (!skipPatterns.some(p => cleanLine.toLowerCase().includes(p.toLowerCase()))) {
        if (/^[A-Z]/.test(cleanLine) && !/^\d/.test(cleanLine) && !cleanLine.includes('http')) {
          // Likely a company name
          company = cleanLine;
          continue;
        }
      }
    }
    
    // Look for location (Australian cities/states)
    if (!location) {
      const locationMatch = line.match(/\b(Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra|Hobart|Darwin|Gold Coast|Newcastle|Wollongong|Geelong|Townsville|Cairns|ACT|NSW|VIC|QLD|WA|SA|TAS|NT)(?:\s+CBD)?(?:\s*[,&]\s*[A-Za-z\s]+)?/i);
      if (locationMatch) {
        location = locationMatch[0].trim();
      }
    }
    
    // Look for salary
    if (!salary_range) {
      const salaryMatch = line.match(/\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?(?:\s*(?:per|p\.?a\.?|annually|yearly|pa|k|per annum|per year))?/i);
      if (salaryMatch) {
        salary_range = salaryMatch[0].trim();
      }
    }
    
    // Look for work type
    if (!work_type) {
      const workTypeMatch = line.match(/\b(Full[- ]?time|Part[- ]?time|Contract|Casual|Temporary|Permanent)\b/i);
      if (workTypeMatch) {
        work_type = workTypeMatch[0];
      }
    }
    
    // Look for work arrangement
    if (!work_arrangement) {
      const arrangementMatch = line.match(/\b(Remote|Hybrid|On[- ]?site|Work from home|WFH|Flexible)\b/i);
      if (arrangementMatch) {
        work_arrangement = arrangementMatch[0];
      }
    }
    
    // Look for date posted
    if (!date_posted) {
      const dateMatch = line.match(/(?:Posted\s+)?(\d+[dh]?\s*(?:day|hour|minute)s?\s*ago|Just posted|Today|Yesterday|\d+[dh]\s*ago)/i);
      if (dateMatch) {
        date_posted = dateMatch[1] || dateMatch[0];
      }
    }
    
    // Build description snippet from longer content lines
    if (!description_snippet && cleanLine.length > 80 && cleanLine.length < 500) {
      if (!cleanLine.includes('©') && !cleanLine.includes('Privacy') && 
          !cleanLine.includes('Terms') && !cleanLine.includes('cookie')) {
        description_snippet = cleanLine;
      }
    }
  }
  
  // If we still don't have title/company, try alternative patterns
  if (!title) {
    // Look for any substantial heading
    const headingMatch = markdown.match(/^#+\s+(.+)$/m);
    if (headingMatch) {
      title = headingMatch[1].replace(/\*\*/g, '').trim();
    }
  }
  
  // Validate we have minimum required fields
  if (!title || title.length < 3) {
    return null;
  }
  
  if (!company || company.length < 2) {
    // Try to find company in "at Company" or "Company is hiring" patterns
    const atCompanyMatch = markdown.match(/(?:at|by|from)\s+([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\s+is|\s+in|\s*[-–]|\s*\n)/);
    if (atCompanyMatch) {
      company = atCompanyMatch[1].trim();
    }
  }
  
  if (!company || company.length < 2) {
    return null;
  }
  
  return {
    seek_job_id: jobId,
    title,
    company,
    location: location || 'Australia',
    salary_range,
    work_type,
    work_arrangement,
    description_snippet: description_snippet || '',
    job_url: `https://www.seek.com.au/job/${jobId}`,
    date_posted,
  };
}

// Helper: enrich jobs by scraping individual detail pages (with concurrency limit)
async function enrichJobsFromIds(
  jobIds: string[], 
  apiKey: string, 
  limit: number
): Promise<{ jobs: ScrapedJob[]; enrichedCount: number }> {
  const jobs: ScrapedJob[] = [];
  let enrichedCount = 0;
  const idsToProcess = jobIds.slice(0, Math.min(jobIds.length, limit + 5)); // Get a few extra in case some fail
  
  console.log(`[scrape-seek] Enriching ${idsToProcess.length} job IDs (limit: ${limit})...`);
  
  // Process in small batches to avoid rate limiting
  const batchSize = 3;
  for (let i = 0; i < idsToProcess.length && jobs.length < limit; i += batchSize) {
    const batch = idsToProcess.slice(i, i + batchSize);
    
    const results = await Promise.all(
      batch.map(jobId => scrapeJobDetails(jobId, apiKey))
    );
    
    for (const job of results) {
      if (job && jobs.length < limit) {
        jobs.push(job);
        enrichedCount++;
      }
    }
    
    // Small delay between batches to be nice to Firecrawl
    if (i + batchSize < idsToProcess.length && jobs.length < limit) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`[scrape-seek] Enrichment complete: ${enrichedCount}/${idsToProcess.length} jobs enriched successfully`);
  return { jobs, enrichedCount };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { keywords, location, filters, limit: rawLimit } = body;

    if (!keywords || typeof keywords !== 'string' || keywords.trim() === '') {
      return jsonResponse({ 
        success: false, 
        error: 'Keywords are required',
        jobs: []
      }, 400);
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('[scrape-seek] FIRECRAWL_API_KEY not configured');
      return jsonResponse({ 
        success: false, 
        error: 'Firecrawl connector not configured',
        jobs: []
      }, 500);
    }

    const jobLimit = parseLimit(rawLimit);
    console.log(`[scrape-seek] Parsed limit: ${rawLimit} -> ${jobLimit}`);

    // Build SEEK URL with proper query params
    const queryParams = new URLSearchParams();
    queryParams.set('keywords', keywords.trim());
    
    if (location && typeof location === 'string' && location.trim()) {
      queryParams.set('where', location.trim());
    }
    
    // Work type (SEEK uses lowercase 'worktype')
    if (filters?.workType && filters.workType !== 'any' && filters.workType !== '') {
      queryParams.set('worktype', filters.workType);
    }
    
    // Work arrangement
    if (filters?.workArrangement && filters.workArrangement !== 'any' && filters.workArrangement !== '') {
      queryParams.set('workarrangement', filters.workArrangement);
    }
    
    // Salary range - only add if at least one value is provided
    const salaryMin = filters?.salaryMin && filters.salaryMin !== 'any' && filters.salaryMin !== '' 
      ? filters.salaryMin : '';
    const salaryMax = filters?.salaryMax && filters.salaryMax !== 'any' && filters.salaryMax !== '' 
      ? filters.salaryMax : '';
    
    if (salaryMin || salaryMax) {
      const rangeStr = `${salaryMin}-${salaryMax}`;
      if (rangeStr !== '-') {
        queryParams.set('salaryrange', rangeStr);
        queryParams.set('salarytype', filters?.salaryType || 'annual');
      }
    }
    
    // Date posted
    if (filters?.datePosted && filters.datePosted !== 'any' && filters.datePosted !== '') {
      queryParams.set('daterange', filters.datePosted);
    }

    const seekUrl = `https://www.seek.com.au/jobs?${queryParams.toString()}`;
    console.log('[scrape-seek] === SEEK SCRAPER START ===');
    console.log('[scrape-seek] Scraping URL:', seekUrl);
    console.log('[scrape-seek] Filters:', JSON.stringify(filters));
    console.log('[scrape-seek] Job limit:', jobLimit);

    // Call Firecrawl API for search results page
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: seekUrl,
        formats: ['markdown', 'links'],
        waitFor: 3000,
        timeout: 30000,
        location: {
          country: 'AU',
          languages: ['en-AU']
        },
        onlyMainContent: false,
      }),
    });

    const scrapeData = await response.json();
    
    // Defensive logging of response shape
    console.log('[scrape-seek] === FIRECRAWL RESPONSE ===');
    console.log('[scrape-seek] HTTP status:', response.status);
    console.log('[scrape-seek] Response success:', scrapeData.success);
    console.log('[scrape-seek] Top-level keys:', Object.keys(scrapeData));
    if (scrapeData.data) {
      console.log('[scrape-seek] scrapeData.data keys:', Object.keys(scrapeData.data));
    }
    
    // Handle Firecrawl error response
    if (!response.ok) {
      const errorMsg = scrapeData.error || `Scraping failed with status ${response.status}`;
      console.error('[scrape-seek] Firecrawl API error:', errorMsg);
      return jsonResponse({ 
        success: false, 
        jobs: [],
        error: errorMsg,
        diagnostics: {
          message: 'Firecrawl API returned an error',
          firecrawl_status: response.status,
          url_scraped: seekUrl,
        }
      }, response.status);
    }

    // Extract data from various possible Firecrawl response shapes
    const data = scrapeData.data || scrapeData;
    const markdown = data?.markdown || scrapeData?.markdown || '';
    const links = data?.links || scrapeData?.links || [];
    
    console.log('[scrape-seek] Markdown length:', markdown.length);
    console.log('[scrape-seek] Links found:', links.length);
    
    if (markdown.length > 0) {
      console.log('[scrape-seek] Markdown sample (first 500 chars):', markdown.substring(0, 500));
    }

    // Check for blocking/CAPTCHA indicators
    const blockingIndicators = ['Cloudflare', 'captcha', 'CAPTCHA', 'Access Denied', 'blocked', 'Please verify', 'challenge-platform'];
    const possibleBlocking = blockingIndicators.some(indicator => 
      markdown.toLowerCase().includes(indicator.toLowerCase())
    );
    
    if (possibleBlocking) {
      console.warn('[scrape-seek] ⚠️ Possible anti-bot blocking detected!');
    }

    // Parse jobs from content
    const { jobs, parsingMethod, foundIds } = await parseSeekJobs(data, markdown, links, jobLimit, apiKey);
    
    console.log('[scrape-seek] === PARSING RESULTS ===');
    console.log(`[scrape-seek] Parsed ${jobs.length} jobs using: ${parsingMethod}`);
    
    if (jobs.length > 0) {
      console.log('[scrape-seek] First job:', JSON.stringify(jobs[0], null, 2));
    }

    // Build diagnostics for troubleshooting
    const diagnostics: DiagnosticInfo = {
      message: jobs.length > 0 ? 'Jobs found successfully' : 'No jobs could be extracted',
      url_scraped: seekUrl,
      firecrawl_status: response.status,
      markdown_length: markdown.length,
      job_ids_found: foundIds,
      jobs_enriched: jobs.length,
      possible_blocking: possibleBlocking,
      parsing_method: parsingMethod,
    };

    if (jobs.length === 0) {
      diagnostics.raw_sample = markdown.substring(0, 300);
      
      if (possibleBlocking) {
        diagnostics.message = 'Page may be blocked by anti-bot protection (Cloudflare/CAPTCHA detected)';
      } else if (markdown.length < 100) {
        diagnostics.message = 'Page returned very little content - may be blocked or loading issue';
      } else if (foundIds > 0) {
        diagnostics.message = `Found ${foundIds} job IDs but could not extract metadata from detail pages`;
      } else {
        diagnostics.message = 'Content loaded but no job data could be extracted - SEEK page structure may have changed';
      }
    }

    console.log('[scrape-seek] === SEEK SCRAPER END ===');

    return jsonResponse({ 
      success: jobs.length > 0, 
      jobs,
      diagnostics: jobs.length === 0 ? diagnostics : undefined 
    });

  } catch (error) {
    console.error('[scrape-seek] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape SEEK';
    return jsonResponse({ 
      success: false, 
      jobs: [],
      error: errorMessage,
      diagnostics: {
        message: `Exception occurred: ${errorMessage}`,
      }
    }, 500);
  }
});

interface ParseResult {
  jobs: ScrapedJob[];
  parsingMethod: string;
  foundIds: number;
}

async function parseSeekJobs(
  data: any, 
  markdown: string, 
  links: string[], 
  limit: number,
  apiKey: string
): Promise<ParseResult> {
  console.log('[scrape-seek] === PARSING ATTEMPT ===');
  
  // Collect all job IDs from links and markdown
  const foundIdSet = new Set<string>();
  
  // Extract job IDs from links array
  for (const link of links) {
    if (typeof link === 'string') {
      const match = link.match(/\/job\/(\d+)/);
      if (match) {
        foundIdSet.add(match[1]);
      }
    }
  }
  
  // Also search markdown for job IDs
  const jobIdPattern = /\/job\/(\d+)/g;
  let match;
  while ((match = jobIdPattern.exec(markdown)) !== null) {
    foundIdSet.add(match[1]);
  }
  
  const foundIds = foundIdSet.size;
  console.log(`[scrape-seek] Found ${foundIds} unique job IDs in content`);

  // Try to parse markdown for job information (search results page)
  const lines = markdown.split('\n');
  let currentJob: Partial<ScrapedJob> = {};
  const parsedFromMarkdown: ScrapedJob[] = [];
  
  for (const line of lines) {
    if (parsedFromMarkdown.length >= limit) break;
    
    // Pattern: ## Job Title or ### Job Title (headers)
    const headerMatch = line.match(/^#{1,3}\s+(.+?)(?:\s*\|.*)?$/);
    if (headerMatch && !headerMatch[1].includes('Search') && !headerMatch[1].includes('Filter')) {
      // Save previous job if valid
      if (currentJob.seek_job_id && currentJob.title) {
        const builtJob = buildJob(currentJob);
        if (isValidJob(builtJob)) {
          parsedFromMarkdown.push(builtJob);
        }
      }
      currentJob = { title: headerMatch[1].trim() };
      continue;
    }
    
    // Pattern: [Title](/job/ID) - markdown links
    const linkMatch = line.match(/\[([^\]]+)\]\((?:https:\/\/www\.seek\.com\.au)?\/job\/(\d+)[^\)]*\)/);
    if (linkMatch) {
      // Save previous job if valid
      if (currentJob.seek_job_id && currentJob.title) {
        const builtJob = buildJob(currentJob);
        if (isValidJob(builtJob)) {
          parsedFromMarkdown.push(builtJob);
        }
      }
      currentJob = {
        seek_job_id: linkMatch[2],
        title: linkMatch[1].trim(),
      };
      continue;
    }

    // If we have a current job being built, try to extract more info
    if (currentJob.title || currentJob.seek_job_id) {
      extractJobDetails(line, currentJob, foundIdSet);
    }
  }

  // Don't forget the last job
  if (currentJob.seek_job_id && currentJob.title && parsedFromMarkdown.length < limit) {
    const builtJob = buildJob(currentJob);
    if (isValidJob(builtJob)) {
      parsedFromMarkdown.push(builtJob);
    }
  }
  
  // Filter to only valid jobs
  const validJobs = parsedFromMarkdown.filter(isValidJob);
  
  if (validJobs.length > 0) {
    console.log(`[scrape-seek] Parsed ${validJobs.length} valid jobs from markdown`);
    return { 
      jobs: validJobs.slice(0, limit),
      parsingMethod: 'markdown_parsing',
      foundIds
    };
  }

  // If no valid jobs from markdown but we have IDs, enrich from detail pages
  if (foundIdSet.size > 0) {
    console.log(`[scrape-seek] No valid jobs from markdown. Enriching ${foundIdSet.size} job IDs from detail pages...`);
    
    const jobIds = Array.from(foundIdSet);
    const { jobs: enrichedJobs, enrichedCount } = await enrichJobsFromIds(jobIds, apiKey, limit);
    
    if (enrichedJobs.length > 0) {
      return { 
        jobs: enrichedJobs,
        parsingMethod: 'detail_page_enrichment',
        foundIds
      };
    }
    
    console.warn(`[scrape-seek] Enrichment failed for all ${foundIdSet.size} job IDs`);
  }

  return { jobs: [], parsingMethod: 'none', foundIds };
}

function buildJob(partial: Partial<ScrapedJob>): ScrapedJob {
  return {
    seek_job_id: String(partial.seek_job_id || ''),
    title: partial.title || '',
    company: partial.company || '',
    location: partial.location || 'Australia',
    salary_range: partial.salary_range,
    work_type: partial.work_type,
    work_arrangement: partial.work_arrangement,
    description_snippet: partial.description_snippet || '',
    job_url: `https://www.seek.com.au/job/${partial.seek_job_id}`,
    date_posted: partial.date_posted,
  };
}

function extractJobDetails(line: string, job: Partial<ScrapedJob>, foundIds: Set<string>): void {
  const cleanLine = line.replace(/\*\*/g, '').replace(/\*/g, '').trim();
  
  // Try to find a job ID if we don't have one
  if (!job.seek_job_id) {
    const idMatch = line.match(/\/job\/(\d+)/);
    if (idMatch) {
      job.seek_job_id = idMatch[1];
    } else {
      for (const id of foundIds) {
        if (line.includes(id)) {
          job.seek_job_id = id;
          break;
        }
      }
    }
  }
  
  // Look for company name (usually follows title, short and capitalized)
  if (!job.company && cleanLine.length > 2 && cleanLine.length < 80) {
    const skipPatterns = ['ago', 'Apply', 'Save', 'Quick apply', 'jobs found', 'Search', 'Filter', 'Sort', 'Posted'];
    if (!skipPatterns.some(p => cleanLine.includes(p)) && !cleanLine.startsWith('[') && !cleanLine.startsWith('#')) {
      if (/^[A-Z]/.test(cleanLine) && !/^\d/.test(cleanLine)) {
        job.company = cleanLine;
        return;
      }
    }
  }
  
  // Look for location (Australian cities)
  if (!job.location) {
    const locationMatch = line.match(/\b(Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra|Hobart|Darwin|Gold Coast|Newcastle|Wollongong|Geelong|Townsville|Cairns|ACT|NSW|VIC|QLD|WA|SA|TAS|NT)[^,\n]{0,30}/i);
    if (locationMatch) {
      job.location = locationMatch[0].trim();
    }
  }
  
  // Look for salary
  if (!job.salary_range) {
    const salaryMatch = line.match(/\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?(?:\s*(?:per|p\.?a\.?|annually|yearly|pa|k))?/i);
    if (salaryMatch) {
      job.salary_range = salaryMatch[0].trim();
    }
  }
  
  // Look for work type
  if (!job.work_type) {
    const workTypeMatch = line.match(/\b(Full[- ]?time|Part[- ]?time|Contract|Casual|Temporary|Permanent)\b/i);
    if (workTypeMatch) {
      job.work_type = workTypeMatch[0];
    }
  }

  // Look for work arrangement
  if (!job.work_arrangement) {
    const arrangementMatch = line.match(/\b(Remote|Hybrid|On[- ]?site|Work from home|WFH|Flexible)\b/i);
    if (arrangementMatch) {
      job.work_arrangement = arrangementMatch[0];
    }
  }
  
  // Look for date posted
  if (!job.date_posted) {
    const dateMatch = line.match(/(\d+[dh]?\s*(?:day|hour|minute)s?\s*ago|Just posted|Today|Yesterday|\d+[dh]\s*ago)/i);
    if (dateMatch) {
      job.date_posted = dateMatch[0];
    }
  }
  
  // Build description from content (longer lines that look like descriptions)
  if (!job.description_snippet && cleanLine.length > 60 && cleanLine.length < 400) {
    if (!cleanLine.includes('©') && !cleanLine.includes('Privacy') && !cleanLine.includes('Terms')) {
      job.description_snippet = cleanLine;
    }
  }
}
