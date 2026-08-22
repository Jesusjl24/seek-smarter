-- Legacy public URLs are replaced by short-lived signed URLs over file_path
ALTER TABLE public.resume_profile DROP COLUMN IF EXISTS file_url;
UPDATE public.resume_profile SET file_path = NULL, file_name = NULL, file_type = NULL WHERE file_path IS NULL;