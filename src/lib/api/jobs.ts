import { supabase } from "@/integrations/supabase/client";
import type { Job, JobWithMatch, JobMatch, ScrapedJob, PipelineStatus, PipelineCounts, JobArtifact, TailoredResume, CoverLetter, ResumeProfile, RubricScores } from "@/types/job";

/**
 * Converts relative date strings like "3d ago", "1d ago", "Today", "Yesterday"
 * to ISO date strings. Returns null if parsing fails.
 */
function parseRelativeDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  
  const normalized = dateStr.trim().toLowerCase();
  const today = new Date();
  
  // Handle "Xd ago" format
  const daysAgoMatch = normalized.match(/^(\d+)d\s*ago$/i);
  if (daysAgoMatch) {
    const daysAgo = parseInt(daysAgoMatch[1], 10);
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  }
  
  // Handle "Xh ago" format (same day)
  const hoursAgoMatch = normalized.match(/^(\d+)h\s*ago$/i);
  if (hoursAgoMatch) {
    return today.toISOString().split('T')[0];
  }
  
  // Handle "Xm ago" format (same day)
  const minsAgoMatch = normalized.match(/^(\d+)m\s*ago$/i);
  if (minsAgoMatch) {
    return today.toISOString().split('T')[0];
  }
  
  // Handle "today" or "just posted"
  if (normalized === 'today' || normalized === 'just posted' || normalized === 'just now') {
    return today.toISOString().split('T')[0];
  }
  
  // Handle "yesterday"
  if (normalized === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
  
  // Try parsing as ISO date directly
  const isoMatch = dateStr.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    return isoMatch[0];
  }
  
  // If we can't parse it, return null rather than an invalid date
  console.warn('Could not parse date:', dateStr);
  return null;
}

export async function fetchJobs(): Promise<JobWithMatch[]> {
  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("*")
    .order("date_scraped", { ascending: false });

  if (jobsError) throw jobsError;

  const { data: matches, error: matchesError } = await supabase
    .from("job_matches")
    .select("*");

  if (matchesError) throw matchesError;

  const matchMap = new Map<string, JobMatch>();
  matches?.forEach((match) => {
    matchMap.set(match.job_id, {
      ...match,
      scores: match.scores as unknown as RubricScores | undefined,
    } as JobMatch);
  });

  return (jobs || []).map((job) => ({
    ...job,
    match: matchMap.get(job.id),
  })) as JobWithMatch[];
}

export async function fetchJobsByStatus(
  status: PipelineStatus | PipelineStatus[]
): Promise<JobWithMatch[]> {
  const statuses = Array.isArray(status) ? status : [status];
  
  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("*")
    .in("pipeline_status", statuses)
    .order("updated_at", { ascending: false });

  if (jobsError) throw jobsError;

  const { data: matches, error: matchesError } = await supabase
    .from("job_matches")
    .select("*");

  if (matchesError) throw matchesError;

  const matchMap = new Map<string, JobMatch>();
  matches?.forEach((match) => {
    matchMap.set(match.job_id, {
      ...match,
      scores: match.scores as unknown as RubricScores | undefined,
    } as JobMatch);
  });

  return (jobs || []).map((job) => ({
    ...job,
    match: matchMap.get(job.id),
  })) as JobWithMatch[];
}

export async function fetchPipelineCounts(): Promise<PipelineCounts> {
  const { data, error } = await supabase
    .from("jobs")
    .select("pipeline_status");

  if (error) throw error;

  const counts: PipelineCounts = {
    inbox: 0,
    shortlist: 0,
    not_fit: 0,
    applied: 0,
    interview: 0,
    offer: 0,
  };

  (data || []).forEach((job) => {
    const status = job.pipeline_status as PipelineStatus;
    if (status === 'inbox') counts.inbox++;
    else if (status === 'shortlist') counts.shortlist++;
    else if (status === 'not_fit' || status === 'rejected' || status === 'withdrawn') counts.not_fit++;
    else if (status === 'applied' || status === 'screening') counts.applied++;
    else if (status === 'interview' || status === 'final_interview') counts.interview++;
    else if (status === 'offer') counts.offer++;
  });

  return counts;
}

export async function upsertJobs(
  scrapedJobs: ScrapedJob[]
): Promise<{ newCount: number; existingCount: number }> {
  let newCount = 0;
  let existingCount = 0;

  console.log('Upserting', scrapedJobs.length, 'jobs');

  for (const job of scrapedJobs) {
    try {
      // Skip placeholder jobs
      if (/^SEEK Job #\d+$/i.test(job.title) || job.company === 'View on SEEK') {
        console.warn('Skipping placeholder job:', job.seek_job_id);
        continue;
      }

      const { data: existing } = await supabase
        .from("jobs")
        .select("id")
        .eq("seek_job_id", job.seek_job_id)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabase
          .from("jobs")
          .update({ date_scraped: new Date().toISOString() })
          .eq("seek_job_id", job.seek_job_id);
        
        if (updateError) {
          console.error('Error updating job:', updateError);
        } else {
          existingCount++;
        }
      } else {
        const { error: insertError } = await supabase.from("jobs").insert({
          seek_job_id: job.seek_job_id,
          title: job.title,
          company: job.company,
          location: job.location,
          salary_range: job.salary_range || null,
          work_type: job.work_type || null,
          work_arrangement: job.work_arrangement || null,
          description_snippet: job.description_snippet || '',
          job_url: job.job_url,
          date_posted: parseRelativeDate(job.date_posted),
          pipeline_status: 'inbox',
        });
        
        if (insertError) {
          console.error('Error inserting job:', job.seek_job_id, insertError);
        } else {
          newCount++;
        }
      }
    } catch (error) {
      console.error('Error processing job:', job.seek_job_id, error);
    }
  }

  console.log('Upsert complete: new =', newCount, ', existing =', existingCount);
  return { newCount, existingCount };
}

export async function deleteJob(jobId: string): Promise<void> {
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) throw error;
}

export async function deleteJobs(jobIds: string[]): Promise<void> {
  const { error } = await supabase.from("jobs").delete().in("id", jobIds);
  if (error) throw error;
}

export async function updateJobStatus(
  jobId: string,
  status: PipelineStatus
): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({ pipeline_status: status })
    .eq("id", jobId);
  if (error) throw error;
}

export async function bulkUpdateJobStatus(
  jobIds: string[],
  status: PipelineStatus
): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({ pipeline_status: status })
    .in("id", jobIds);
  if (error) throw error;
}

export async function updateJobNotes(
  jobId: string,
  notes: string
): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({ notes })
    .eq("id", jobId);
  if (error) throw error;
}

export async function saveJobMatch(match: Omit<JobMatch, "id" | "scored_at">): Promise<JobMatch> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { scores, ...matchWithoutScores } = match;
  const insertData: Record<string, unknown> = {
    ...matchWithoutScores,
    scores: scores ? scores : null,
  };
  
  const { data, error } = await supabase
    .from("job_matches")
    .upsert(insertData as never, { onConflict: "job_id,resume_profile_id" })
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    scores: data.scores as unknown as RubricScores | undefined,
  } as JobMatch;
}

// Fetch artifacts for a specific job
export async function fetchJobArtifacts(jobId: string): Promise<JobArtifact[]> {
  const { data, error } = await supabase
    .from("job_artifacts")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as JobArtifact[];
}

// Save a job artifact
export async function saveJobArtifact(
  artifact: Omit<JobArtifact, "id" | "created_at">
): Promise<JobArtifact> {
  const insertData: Record<string, unknown> = {
    job_id: artifact.job_id,
    artifact_type: artifact.artifact_type,
    content: artifact.content,
    agent: artifact.agent,
    version: artifact.version,
  };
  
  const { data, error } = await supabase
    .from("job_artifacts")
    .insert(insertData as never)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as JobArtifact;
}

// Generate tailored resume via edge function
export async function generateTailoredResume(
  job: Job,
  profile: ResumeProfile,
  matchScore: number
): Promise<TailoredResume> {
  const { data, error } = await supabase.functions.invoke("tailor-resume", {
    body: {
      job: {
        title: job.title,
        company: job.company,
        location: job.location,
        description_snippet: job.description_snippet,
        full_description: job.full_description,
      },
      profile,
      match_score: matchScore,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as TailoredResume;
}

// Generate cover letter via edge function
export async function generateCoverLetter(
  job: Job,
  profile: ResumeProfile,
  matchScore: number,
  tailoredHighlights?: string[]
): Promise<CoverLetter> {
  const { data, error } = await supabase.functions.invoke("generate-cover-letter", {
    body: {
      job: {
        title: job.title,
        company: job.company,
        location: job.location,
        description_snippet: job.description_snippet,
        full_description: job.full_description,
      },
      profile,
      match_score: matchScore,
      tailored_highlights: tailoredHighlights,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as CoverLetter;
}
