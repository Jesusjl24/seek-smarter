export interface Job {
  id: string;
  seek_job_id: string;
  title: string;
  company: string;
  location: string;
  salary_range: string | null;
  work_type: string | null;
  work_arrangement: string | null;
  description_snippet: string;
  full_description: string | null;
  job_url: string;
  date_posted: string | null;
  date_scraped: string;
}

export interface ResumeProfile {
  id: string;
  raw_text: string;
  skills_technical: string[];
  skills_soft: string[];
  years_experience: number | null;
  education: string[];
  certifications: string[];
  previous_titles: string[];
  industries: string[];
  summary: string | null;
  updated_at: string;
}

export interface JobMatch {
  id: string;
  job_id: string;
  resume_profile_id: string;
  match_score: number;
  skill_match_percentage: number | null;
  recommendation: string;
  reasoning: string | null;
  pros: string[];
  cons: string[];
  gaps: string[];
  strategic_advice: string | null;
  scored_at: string;
}

export interface JobWithMatch extends Job {
  match?: JobMatch;
}

export interface SearchFilters {
  keywords: string;
  location: string;
  workTypes: string[];
  workArrangements: string[];
  minSalary: string;
  datePosted: string;
  jobLimit: string;
}

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
