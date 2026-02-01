-- Create storage bucket for resumes
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy for public read access
CREATE POLICY "Resume files are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'resumes');

-- Create policy for uploads (no auth required for this single-user app)
CREATE POLICY "Anyone can upload resumes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'resumes');

-- Create policy for updates
CREATE POLICY "Anyone can update resumes"
ON storage.objects FOR UPDATE
USING (bucket_id = 'resumes');

-- Create policy for deletes
CREATE POLICY "Anyone can delete resumes"
ON storage.objects FOR DELETE
USING (bucket_id = 'resumes');

-- Add file_url column to resume_profile
ALTER TABLE public.resume_profile
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_type TEXT;