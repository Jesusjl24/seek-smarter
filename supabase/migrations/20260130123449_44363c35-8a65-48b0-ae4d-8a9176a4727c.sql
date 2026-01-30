-- Create jobs table for storing scraped SEEK job listings
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seek_job_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL,
  salary_range TEXT,
  work_type TEXT,
  work_arrangement TEXT,
  description_snippet TEXT NOT NULL,
  full_description TEXT,
  job_url TEXT NOT NULL,
  date_posted DATE,
  date_scraped TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create resume_profile table for storing parsed resume data (single-user, one row max)
CREATE TABLE public.resume_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text TEXT NOT NULL,
  skills_technical TEXT[] DEFAULT '{}',
  skills_soft TEXT[] DEFAULT '{}',
  years_experience INTEGER,
  education TEXT[] DEFAULT '{}',
  certifications TEXT[] DEFAULT '{}',
  previous_titles TEXT[] DEFAULT '{}',
  industries TEXT[] DEFAULT '{}',
  summary TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create job_matches table for storing AI-generated match scores
CREATE TABLE public.job_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  resume_profile_id UUID NOT NULL REFERENCES public.resume_profile(id) ON DELETE CASCADE,
  match_score INTEGER NOT NULL CHECK (match_score >= 0 AND match_score <= 100),
  skill_match_percentage INTEGER CHECK (skill_match_percentage >= 0 AND skill_match_percentage <= 100),
  recommendation TEXT NOT NULL,
  reasoning TEXT,
  pros TEXT[] DEFAULT '{}',
  cons TEXT[] DEFAULT '{}',
  gaps TEXT[] DEFAULT '{}',
  strategic_advice TEXT,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, resume_profile_id)
);

-- Enable RLS on all tables (but with permissive policies for single-user app)
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for all operations (single-user personal tool, no auth needed)
CREATE POLICY "Allow all operations on jobs" ON public.jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on resume_profile" ON public.resume_profile FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on job_matches" ON public.job_matches FOR ALL USING (true) WITH CHECK (true);

-- Create index for faster job lookups
CREATE INDEX idx_jobs_seek_job_id ON public.jobs(seek_job_id);
CREATE INDEX idx_jobs_date_scraped ON public.jobs(date_scraped DESC);
CREATE INDEX idx_job_matches_job_id ON public.job_matches(job_id);
CREATE INDEX idx_job_matches_score ON public.job_matches(match_score DESC);