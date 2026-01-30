import { supabase } from "@/integrations/supabase/client";
import type { Job, JobWithMatch, JobMatch, ScrapedJob } from "@/types/job";

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
    matchMap.set(match.job_id, match as JobMatch);
  });

  return (jobs || []).map((job) => ({
    ...job,
    match: matchMap.get(job.id),
  })) as JobWithMatch[];
}

export async function upsertJobs(
  scrapedJobs: ScrapedJob[]
): Promise<{ newCount: number; existingCount: number }> {
  let newCount = 0;
  let existingCount = 0;

  console.log('Upserting', scrapedJobs.length, 'jobs');

  for (const job of scrapedJobs) {
    try {
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
          date_posted: job.date_posted || null,
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

export async function saveJobMatch(match: Omit<JobMatch, "id" | "scored_at">): Promise<JobMatch> {
  const { data, error } = await supabase
    .from("job_matches")
    .upsert(match, { onConflict: "job_id,resume_profile_id" })
    .select()
    .single();

  if (error) throw error;
  return data as JobMatch;
}
