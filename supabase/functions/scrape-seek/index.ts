import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, location, filters } = await req.json();

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

    // Use Firecrawl to scrape SEEK
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: seekUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
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

    // Parse the scraped content to extract job listings
    const jobs = parseSeekJobs(scrapeData.data?.html || '', scrapeData.data?.markdown || '', seekUrl);
    console.log(`Parsed ${jobs.length} jobs from SEEK`);

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

function parseSeekJobs(html: string, markdown: string, baseUrl: string): ScrapedJob[] {
  const jobs: ScrapedJob[] = [];
  
  // Try to extract job IDs from the HTML/markdown
  // SEEK job URLs typically look like: /job/12345678
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
  // SEEK listings typically have patterns like:
  // [Job Title](url) - Company - Location
  const lines = markdown.split('\n');
  
  // Look for job card patterns in the content
  let currentJob: Partial<ScrapedJob> = {};
  
  for (const line of lines) {
    // Look for job links [Title](/job/ID)
    const linkMatch = line.match(/\[([^\]]+)\]\(\/job\/(\d+)[^\)]*\)/);
    if (linkMatch) {
      // Save previous job if valid
      if (currentJob.seek_job_id && currentJob.title && currentJob.company) {
        jobs.push({
          seek_job_id: currentJob.seek_job_id,
          title: currentJob.title,
          company: currentJob.company || 'Unknown Company',
          location: currentJob.location || 'Australia',
          salary_range: currentJob.salary_range,
          work_type: currentJob.work_type,
          work_arrangement: currentJob.work_arrangement,
          description_snippet: currentJob.description_snippet || '',
          job_url: `https://www.seek.com.au/job/${currentJob.seek_job_id}`,
        });
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
      // Look for company name (usually follows title)
      if (!currentJob.company && line.trim() && !line.startsWith('[') && !line.startsWith('#')) {
        const cleanLine = line.replace(/\*\*/g, '').trim();
        if (cleanLine.length > 2 && cleanLine.length < 100) {
          currentJob.company = cleanLine;
          continue;
        }
      }
      
      // Look for location
      if (!currentJob.location && line.includes('Location') || line.match(/\b(Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra|Hobart|Darwin)\b/i)) {
        const locationMatch = line.match(/\b(Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra|Hobart|Darwin|NSW|VIC|QLD|WA|SA|ACT|TAS|NT)[^,\n]*/i);
        if (locationMatch) {
          currentJob.location = locationMatch[0].trim();
        }
      }
      
      // Look for salary
      if (!currentJob.salary_range && line.match(/\$[\d,]+/)) {
        const salaryMatch = line.match(/\$[\d,]+\s*-?\s*\$?[\d,]*/);
        if (salaryMatch) {
          currentJob.salary_range = salaryMatch[0];
        }
      }
      
      // Look for work type
      if (!currentJob.work_type) {
        const workTypeMatch = line.match(/\b(Full[- ]?time|Part[- ]?time|Contract|Casual|Temporary)\b/i);
        if (workTypeMatch) {
          currentJob.work_type = workTypeMatch[0];
        }
      }

      // Look for work arrangement
      if (!currentJob.work_arrangement) {
        const arrangementMatch = line.match(/\b(Remote|Hybrid|On[- ]?site|Work from home|WFH)\b/i);
        if (arrangementMatch) {
          currentJob.work_arrangement = arrangementMatch[0];
        }
      }
      
      // Build description from content
      if (!currentJob.description_snippet && line.trim().length > 50) {
        currentJob.description_snippet = line.trim().substring(0, 200);
      }
    }
  }

  // Don't forget the last job
  if (currentJob.seek_job_id && currentJob.title) {
    jobs.push({
      seek_job_id: currentJob.seek_job_id,
      title: currentJob.title,
      company: currentJob.company || 'Unknown Company',
      location: currentJob.location || 'Australia',
      salary_range: currentJob.salary_range,
      work_type: currentJob.work_type,
      work_arrangement: currentJob.work_arrangement,
      description_snippet: currentJob.description_snippet || 'Click to view full job description on SEEK',
      job_url: `https://www.seek.com.au/job/${currentJob.seek_job_id}`,
    });
  }

  // If we found job IDs but couldn't parse details, create basic entries
  if (jobs.length === 0 && foundIds.size > 0) {
    let index = 0;
    for (const jobId of Array.from(foundIds).slice(0, 20)) {
      jobs.push({
        seek_job_id: jobId,
        title: `Job Listing #${index + 1}`,
        company: 'See SEEK for details',
        location: 'Australia',
        description_snippet: 'Click to view full job description on SEEK',
        job_url: `https://www.seek.com.au/job/${jobId}`,
      });
      index++;
    }
  }

  // Limit to 20 jobs max
  return jobs.slice(0, 20);
}
