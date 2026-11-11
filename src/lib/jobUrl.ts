export function seekUrl(job?: { job_url?: string | null; seek_job_id?: string | number | null } | null): string {
  const url = String(job?.job_url || "").trim();
  if (/^https?:\/\//i.test(url)) return url;
  const id = String(job?.seek_job_id || "").replace(/^SEEK Job #/i, "").trim();
  return id ? `https://www.seek.com.au/job/${id}` : "";
}
