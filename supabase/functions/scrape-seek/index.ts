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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, location, filters, limit = 20 } = await req.json();

    if (!keywords) {
      return new Response(
        JSON.stringify({ success: false, error: 'Keywords are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build SEEK search URL
    const searchParams = new URLSearchParams();
    searchParams.set('keywords', keywords);
    if (location) searchParams.set('where', location);
    
    // Add filters
    if (filters?.workTypes?.length) {
      filters.workTypes.forEach((type: string) => {
        const typeMap: Record<string, string> = {
          'Full time': 'full-time',
          'Part time': 'part-time',
          'Contract': 'contract',
          'Casual': 'casual'
        };
        if (typeMap[type]) searchParams.append('worktype', typeMap[type]);
      });
    }
    
    if (filters?.minSalary && filters.minSalary !== 'any') {
      searchParams.set('salaryrange', `${filters.minSalary}-`);
    }
    
    if (filters?.datePosted && filters.datePosted !== 'any') {
      searchParams.set('daterange', filters.datePosted);
    }

    const seekUrl = `https://www.seek.com.au/${keywords.toLowerCase().replace(/\s+/g, '-')}-jobs?${searchParams.toString()}`;
    console.log('Scraping SEEK URL:', seekUrl);

    // Use Firecrawl to scrape SEEK with extract for structured data
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: seekUrl,
        formats: ['markdown', 'html', 'extract'],
        extract: {
          prompt: `Extract all job listings from this SEEK job search results page. For each job, extract the title, company name, location, salary if shown, work type (Full-time/Part-time/Contract), work arrangement (Remote/Hybrid/On-site), a brief description snippet, the SEEK job ID (numeric ID from the URL), and when it was posted.`,
          schema: {
            type: 'object',
            properties: {
              jobs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    company: { type: 'string' },
                    location: { type: 'string' },
                    salary: { type: 'string' },
                    workType: { type: 'string' },
                    workArrangement: { type: 'string' },
                    snippet: { type: 'string' },
                    jobId: { type: 'string' },
                    datePosted: { type: 'string' }
                  }
                }
              }
            }
          }
        },
        onlyMainContent: true,
        waitFor: 5000,
      }),
    });

    const scrapeData = await response.json();
    console.log('Firecrawl response status:', response.status);

    if (!response.ok) {
      console.error('Firecrawl API error:', scrapeData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: scrapeData.error || `Scraping failed with status ${response.status}` 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the scraped content
    const jobLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50);
    const jobs = parseSeekJobs(scrapeData.data, jobLimit);
    console.log(`Parsed ${jobs.length} jobs from SEEK (limit: ${jobLimit})`);

    return new Response(
      JSON.stringify({ success: true, jobs }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping SEEK:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape SEEK';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseSeekJobs(data: any, limit: number): ScrapedJob[] {
  const jobs: ScrapedJob[] = [];
  
  // Try to use the extract data first
  const extractedJobs = data?.extract?.jobs || data?.json?.jobs || (Array.isArray(data?.extract) ? data.extract : null) || (Array.isArray(data?.json) ? data.json : null);
  
  if (extractedJobs && Array.isArray(extractedJobs)) {
    console.log('Using extracted data, found', extractedJobs.length, 'jobs');
    
    for (const job of extractedJobs) {
      if (jobs.length >= limit) break;
      
      const jobId = extractJobId(job.jobId || job.id || job.link || '');
      if (!jobId) continue;
      
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
  }
  
  // If JSON extraction didn't work, fall back to parsing markdown/HTML
  if (jobs.length === 0) {
    console.log('Falling back to markdown/HTML parsing');
    const html = data?.html || '';
    const markdown = data?.markdown || '';
    
    // Extract job IDs from links
    const jobIdPattern = /\/job\/(\d+)/g;
    const foundIds = new Set<string>();
    
    let match;
    while ((match = jobIdPattern.exec(html)) !== null) {
      foundIds.add(match[1]);
    }
    while ((match = jobIdPattern.exec(markdown)) !== null) {
      foundIds.add(match[1]);
    }

    // Parse markdown for job information
    const lines = markdown.split('\n');
    let currentJob: Partial<ScrapedJob> = {};
    
    for (const line of lines) {
      if (jobs.length >= limit) break;
      
      // Look for job links [Title](/job/ID)
      const linkMatch = line.match(/\[([^\]]+)\]\(\/job\/(\d+)[^\)]*\)/);
      if (linkMatch) {
        // Save previous job if valid
        if (currentJob.seek_job_id && currentJob.title) {
          jobs.push(buildJob(currentJob));
        }
        
        // Start new job
        currentJob = {
          seek_job_id: linkMatch[2],
          title: linkMatch[1].trim(),
        };
        continue;
      }

      // If we have a current job, try to extract more info
      if (currentJob.seek_job_id) {
        extractJobDetails(line, currentJob);
      }
    }

    // Don't forget the last job
    if (currentJob.seek_job_id && currentJob.title && jobs.length < limit) {
      jobs.push(buildJob(currentJob));
    }

    // If we still have no jobs but found IDs, try to scrape individual job pages
    if (jobs.length === 0 && foundIds.size > 0) {
      console.log(`Found ${foundIds.size} job IDs but couldn't parse details. Creating placeholder entries.`);
      let index = 0;
      for (const jobId of Array.from(foundIds).slice(0, limit)) {
        jobs.push({
          seek_job_id: jobId,
          title: `SEEK Job #${jobId}`,
          company: 'View on SEEK',
          location: 'Australia',
          description_snippet: 'Click "View on SEEK" to see full job details',
          job_url: `https://www.seek.com.au/job/${jobId}`,
        });
        index++;
      }
    }
  }

  return jobs.slice(0, limit);
}

function extractJobId(input: string): string | null {
  if (!input) return null;
  
  // If it's already just a number
  if (/^\d+$/.test(input)) return input;
  
  // Extract from URL or path
  const match = input.match(/\/job\/(\d+)/);
  if (match) return match[1];
  
  // Extract any number sequence
  const numMatch = input.match(/(\d{6,})/);
  if (numMatch) return numMatch[1];
  
  return null;
}

function cleanText(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  return text.toString().trim().replace(/\s+/g, ' ');
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

function extractJobDetails(line: string, job: Partial<ScrapedJob>): void {
  const cleanLine = line.replace(/\*\*/g, '').trim();
  
  // Look for company name (usually follows title)
  if (!job.company && cleanLine.length > 2 && cleanLine.length < 100 && !cleanLine.startsWith('[') && !cleanLine.startsWith('#')) {
    // Skip lines that look like metadata
    if (!cleanLine.includes('ago') && !cleanLine.includes('Apply') && !cleanLine.includes('Save')) {
      job.company = cleanLine;
      return;
    }
  }
  
  // Look for location
  if (!job.location) {
    const locationMatch = line.match(/\b(Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra|Hobart|Darwin|Gold Coast|Newcastle|Wollongong)[^,\n]*/i);
    if (locationMatch) {
      job.location = locationMatch[0].trim();
    }
  }
  
  // Look for salary
  if (!job.salary_range && line.match(/\$[\d,]+/)) {
    const salaryMatch = line.match(/\$[\d,]+\s*-?\s*\$?[\d,]*/);
    if (salaryMatch) {
      job.salary_range = salaryMatch[0];
    }
  }
  
  // Look for work type
  if (!job.work_type) {
    const workTypeMatch = line.match(/\b(Full[- ]?time|Part[- ]?time|Contract|Casual|Temporary)\b/i);
    if (workTypeMatch) {
      job.work_type = workTypeMatch[0];
    }
  }

  // Look for work arrangement
  if (!job.work_arrangement) {
    const arrangementMatch = line.match(/\b(Remote|Hybrid|On[- ]?site|Work from home|WFH)\b/i);
    if (arrangementMatch) {
      job.work_arrangement = arrangementMatch[0];
    }
  }
  
  // Look for date posted
  if (!job.date_posted) {
    const dateMatch = line.match(/(\d+[dh]?\s*ago|Just posted|Today|Yesterday)/i);
    if (dateMatch) {
      job.date_posted = dateMatch[0];
    }
  }
  
  // Build description from content
  if (!job.description_snippet && cleanLine.length > 50) {
    job.description_snippet = cleanLine.substring(0, 200);
  }
}
