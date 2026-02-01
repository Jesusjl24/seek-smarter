-- Add pipeline tracking columns to jobs table
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add constraint for valid pipeline statuses
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_pipeline_status_check 
  CHECK (pipeline_status IN ('inbox', 'shortlist', 'not_fit', 'applied', 'screening', 'interview', 'final_interview', 'offer', 'rejected', 'withdrawn'));

-- Create index for faster filtering by status
CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_status ON public.jobs(pipeline_status);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_updated_at_trigger ON public.jobs;
CREATE TRIGGER jobs_updated_at_trigger
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_jobs_updated_at();