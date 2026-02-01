-- Create job_artifacts table for storing AI-generated content
CREATE TABLE public.job_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  content JSONB NOT NULL,
  agent TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_job_artifacts_job_id ON public.job_artifacts(job_id);
CREATE INDEX idx_job_artifacts_type ON public.job_artifacts(artifact_type);

-- Enable RLS
ALTER TABLE public.job_artifacts ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for all operations
CREATE POLICY "Allow all operations on job_artifacts" 
ON public.job_artifacts 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Add agent metadata columns to job_matches table
ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS agent TEXT DEFAULT 'job_match_scorer',
  ADD COLUMN IF NOT EXISTS agent_version TEXT DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS veto_reasons TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scores JSONB;