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

  for (const job of scrapedJobs) {
    const { data: existing } = await supabase
      .from("jobs")
      .select("id")
      .eq("seek_job_id", job.seek_job_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("jobs")
        .update({ date_scraped: new Date().toISOString() })
        .eq("seek_job_id", job.seek_job_id);
      existingCount++;
    } else {
      await supabase.from("jobs").insert(job);
      newCount++;
    }
  }

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
