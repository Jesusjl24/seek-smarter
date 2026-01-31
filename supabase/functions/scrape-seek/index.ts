import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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
  html_length?: number;
  extract_data?: any;
  job_ids_found?: number;
  possible_blocking?: boolean;
  raw_sample?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, location, filters, limit = 20 } = await req.json();

    if (!keywords) {
      return new Response(
        JSON.stringify({ success: false, error: 'Keywords are required', diagnostics: { message: 'No keywords provided' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured', diagnostics: { message: 'API key missing' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build SEEK URL using query-param format
    const queryParams = new URLSearchParams();
    queryParams.set('keywords', keywords);
    
    if (location) {
      queryParams.set('where', location);
    }
    
    if (filters?.workType && filters.workType !== 'any' && filters.workType !== '') {
      queryParams.set('worktype', filters.workType);
    }
    
    if (filters?.workArrangement && filters.workArrangement !== 'any' && filters.workArrangement !== '') {
      queryParams.set('workarrangement', filters.workArrangement);
    }
    
    const salaryMin = filters?.salaryMin && filters.salaryMin !== 'any' && filters.salaryMin !== '' ? filters.salaryMin : '';
    const salaryMax = filters?.salaryMax && filters.salaryMax !== 'any' && filters.salaryMax !== '' ? filters.salaryMax : '';
    
    if (salaryMin || salaryMax) {
      queryParams.set('salaryrange', `${salaryMin}-${salaryMax}`);
      queryParams.set('salarytype', filters?.salaryType || 'annual');
    }
    
    if (filters?.datePosted && filters.datePosted !== 'any' && filters.datePosted !== '') {
      queryParams.set('daterange', filters.datePosted);
    }

    const seekUrl = `https://www.seek.com.au/jobs?${queryParams.toString()}`;
    console.log('=== SEEK SCRAPER START ===');
    console.log('Scraping SEEK URL:', seekUrl);
    console.log('Filters:', JSON.stringify(filters));

    // Use Firecrawl with actions and location settings for Australian content
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: seekUrl,
        formats: ['markdown', 'html', 'extract'],
        // Wait for dynamic content to load, then scroll
        actions: [
          { type: 'wait', milliseconds: 4000 },
          { type: 'scroll', direction: 'down' },
          { type: 'wait', milliseconds: 2000 },
          { type: 'scroll', direction: 'down' },
          { type: 'wait', milliseconds: 2000 },
        ],
        extract: {
          prompt: `You are viewing a SEEK.com.au job search results page. Extract ALL job listings visible on the page. Each job card shows: job title (as a link), company name, location, salary (if shown), work type, and a snippet. For each job, extract the SEEK job ID which is a number in the job URL (e.g., /job/12345678). Return all jobs you can find.`,
          schema: {
            type: 'object',
            properties: {
              jobs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Job title' },
                    company: { type: 'string', description: 'Company name' },
                    location: { type: 'string', description: 'Job location' },
                    salary: { type: 'string', description: 'Salary if shown' },
                    workType: { type: 'string', description: 'Full-time, Part-time, Contract, etc.' },
                    workArrangement: { type: 'string', description: 'Remote, Hybrid, On-site' },
                    snippet: { type: 'string', description: 'Job description snippet' },
                    jobId: { type: 'string', description: 'Numeric SEEK job ID from URL' },
                    datePosted: { type: 'string', description: 'When the job was posted' }
                  },
                  required: ['title', 'jobId']
                }
              }
            },
            required: ['jobs']
          }
        },
        // Set Australian location to avoid geo-blocking
        location: {
          country: 'AU',
          languages: ['en-AU']
        },
        onlyMainContent: false,
        waitFor: 5000,
        timeout: 60000,
        blockAds: true,
      }),
    });

    const scrapeData = await response.json();
    
    // Comprehensive logging
    console.log('=== FIRECRAWL RESPONSE ===');
    console.log('Response status:', response.status);
    console.log('Response success:', scrapeData.success);
    
    const data = scrapeData.data || scrapeData;
    const markdown = data?.markdown || '';
    const html = data?.html || '';
    const extractData = data?.extract || data?.json;
    
    console.log('Markdown length:', markdown.length);
    console.log('HTML length:', html.length);
    console.log('Extract data:', JSON.stringify(extractData, null, 2));
    
    if (markdown.length > 0) {
      console.log('Markdown sample (first 500 chars):', markdown.substring(0, 500));
    }

    // Check for blocking/CAPTCHA indicators
    const blockingIndicators = ['Cloudflare', 'captcha', 'CAPTCHA', 'Access Denied', 'blocked', 'Please verify'];
    const possibleBlocking = blockingIndicators.some(indicator => 
      html.includes(indicator) || markdown.includes(indicator)
    );
    
    if (possibleBlocking) {
      console.warn('⚠️ Possible anti-bot blocking detected!');
    }

    if (!response.ok) {
      console.error('Firecrawl API error:', scrapeData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          jobs: [],
          error: scrapeData.error || `Scraping failed with status ${response.status}`,
          diagnostics: {
            message: 'Firecrawl API returned an error',
            firecrawl_status: response.status,
            url_scraped: seekUrl,
          }
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the scraped content
    const jobLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50);
    const jobs = parseSeekJobs(data, jobLimit);
    
    console.log('=== PARSING RESULTS ===');
    console.log(`Parsed ${jobs.length} jobs from SEEK (limit: ${jobLimit})`);
    
    if (jobs.length > 0) {
      console.log('First job sample:', JSON.stringify(jobs[0], null, 2));
    }

    // Build diagnostics for troubleshooting
    const diagnostics: DiagnosticInfo = {
      message: jobs.length > 0 ? 'Jobs found successfully' : 'No jobs could be extracted',
      url_scraped: seekUrl,
      firecrawl_status: response.status,
      markdown_length: markdown.length,
      html_length: html.length,
      extract_data: extractData ? 'present' : 'empty',
      job_ids_found: jobs.length,
      possible_blocking: possibleBlocking,
    };

    if (jobs.length === 0) {
      diagnostics.raw_sample = markdown.substring(0, 300);
      
      // Provide specific diagnostic messages
      if (possibleBlocking) {
        diagnostics.message = 'Page may be blocked by anti-bot protection (Cloudflare/CAPTCHA detected)';
      } else if (markdown.length < 100 && html.length < 100) {
        diagnostics.message = 'Page returned very little content - may be blocked or loading issue';
      } else if (!extractData || (Array.isArray(extractData?.jobs) && extractData.jobs.length === 0)) {
        diagnostics.message = 'Content loaded but no job data could be extracted - SEEK page structure may have changed';
      }
    }

    console.log('=== SEEK SCRAPER END ===');

    return new Response(
      JSON.stringify({ 
        success: jobs.length > 0, 
        jobs,
        diagnostics: jobs.length === 0 ? diagnostics : undefined 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping SEEK:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape SEEK';
    return new Response(
      JSON.stringify({ 
        success: false, 
        jobs: [],
        error: errorMessage,
        diagnostics: {
          message: `Exception occurred: ${errorMessage}`,
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseSeekJobs(data: any, limit: number): ScrapedJob[] {
  const jobs: ScrapedJob[] = [];
  
  console.log('=== PARSING ATTEMPT ===');
  
  // Try to use the extract data first (multiple possible locations)
  const extractedJobs = 
    data?.extract?.jobs || 
    data?.json?.jobs || 
    (Array.isArray(data?.extract) ? data.extract : null) || 
    (Array.isArray(data?.json) ? data.json : null);
  
  if (extractedJobs && Array.isArray(extractedJobs) && extractedJobs.length > 0) {
    console.log('Using LLM extracted data, found', extractedJobs.length, 'jobs');
    
    for (const job of extractedJobs) {
      if (jobs.length >= limit) break;
      
      const jobId = extractJobId(job.jobId || job.id || job.link || job.url || '');
      if (!jobId) {
        console.log('Skipping job - no valid ID:', JSON.stringify(job));
        continue;
      }
      
      jobs.push({
        seek_job_id: jobId,
        title: cleanText(job.title || job.jobTitle) || 'Untitled Position',
        company: cleanText(job.company || job.employer || job.companyName) || 'Unknown Company',
        location: cleanText(job.location || job.area) || 'Australia',
        salary_range: cleanText(job.salary || job.salaryRange),
        work_type: cleanText(job.workType || job.employmentType),
        work_arrangement: cleanText(job.workArrangement || job.remote),
        description_snippet: cleanText(job.snippet || job.description || job.summary) || '',
        job_url: `https://www.seek.com.au/job/${jobId}`,
        date_posted: job.datePosted || job.postedDate,
      });
    }
    
    if (jobs.length > 0) {
      return jobs.slice(0, limit);
    }
  }
  
  // Fallback to parsing markdown/HTML
  console.log('Falling back to markdown/HTML parsing');
  const html = data?.html || '';
  const markdown = data?.markdown || '';
  
  // Collect all job IDs from various sources
  const foundIds = new Set<string>();
  
  // Pattern 1: /job/ID in URLs
  const jobIdPattern = /\/job\/(\d+)/g;
  let match;
  while ((match = jobIdPattern.exec(html)) !== null) {
    foundIds.add(match[1]);
  }
  while ((match = jobIdPattern.exec(markdown)) !== null) {
    foundIds.add(match[1]);
  }
  
  // Pattern 2: data-job-id attributes
  const dataJobIdPattern = /data-job-id=["']?(\d+)["']?/g;
  while ((match = dataJobIdPattern.exec(html)) !== null) {
    foundIds.add(match[1]);
  }
  
  console.log(`Found ${foundIds.size} unique job IDs in content`);

  // Try to parse markdown for job information
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
        parsedFromMarkdown.push(buildJob(currentJob));
      }
      currentJob = { title: headerMatch[1].trim() };
      continue;
    }
    
    // Pattern: [Title](/job/ID) - markdown links
    const linkMatch = line.match(/\[([^\]]+)\]\((?:https:\/\/www\.seek\.com\.au)?\/job\/(\d+)[^\)]*\)/);
    if (linkMatch) {
      // Save previous job if valid
      if (currentJob.seek_job_id && currentJob.title) {
        parsedFromMarkdown.push(buildJob(currentJob));
      }
      currentJob = {
        seek_job_id: linkMatch[2],
        title: linkMatch[1].trim(),
      };
      continue;
    }

    // If we have a current job being built, try to extract more info
    if (currentJob.title || currentJob.seek_job_id) {
      extractJobDetails(line, currentJob, foundIds);
    }
  }

  // Don't forget the last job
  if (currentJob.seek_job_id && currentJob.title && parsedFromMarkdown.length < limit) {
    parsedFromMarkdown.push(buildJob(currentJob));
  }
  
  if (parsedFromMarkdown.length > 0) {
    console.log(`Parsed ${parsedFromMarkdown.length} jobs from markdown`);
    return parsedFromMarkdown.slice(0, limit);
  }

  // Last resort: create entries from found job IDs
  if (foundIds.size > 0) {
    console.log(`Creating ${Math.min(foundIds.size, limit)} placeholder entries from job IDs`);
    
    for (const jobId of Array.from(foundIds).slice(0, limit)) {
      jobs.push({
        seek_job_id: jobId,
        title: `SEEK Job #${jobId}`,
        company: 'View on SEEK for details',
        location: 'Australia',
        description_snippet: 'Click to view full job details on SEEK',
        job_url: `https://www.seek.com.au/job/${jobId}`,
      });
    }
  }

  return jobs.slice(0, limit);
}

function extractJobId(input: string): string | null {
  if (!input) return null;
  
  // If it's already just a number
  if (/^\d{6,}$/.test(input)) return input;
  
  // Extract from URL or path
  const urlMatch = input.match(/\/job\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  
  // Extract any 6+ digit number sequence (SEEK IDs are typically 8+ digits)
  const numMatch = input.match(/(\d{6,})/);
  if (numMatch) return numMatch[1];
  
  return null;
}

function cleanText(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  return text.toString().trim().replace(/\s+/g, ' ').substring(0, 500);
}

function buildJob(partial: Partial<ScrapedJob>): ScrapedJob {
  return {
    seek_job_id: partial.seek_job_id!,
    title: partial.title || 'Untitled Position',
    company: partial.company || 'Unknown Company',
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
      // Try to match with found IDs based on context
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
    // Skip lines that look like metadata or navigation
    const skipPatterns = ['ago', 'Apply', 'Save', 'Quick apply', 'jobs found', 'Search', 'Filter', 'Sort', 'Posted'];
    if (!skipPatterns.some(p => cleanLine.includes(p)) && !cleanLine.startsWith('[') && !cleanLine.startsWith('#')) {
      // Check if it looks like a company name (starts with capital, no special chars at start)
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
    // Avoid navigation/UI text
    if (!cleanLine.includes('©') && !cleanLine.includes('Privacy') && !cleanLine.includes('Terms')) {
      job.description_snippet = cleanLine;
    }
  }
}
