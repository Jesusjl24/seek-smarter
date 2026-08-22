CREATE TABLE public.candidate_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  job_goals text,
  career_direction text,
  target_titles text[] NOT NULL DEFAULT '{}',
  target_industries text[] NOT NULL DEFAULT '{}',
  excluded_titles text[] NOT NULL DEFAULT '{}',
  salary_min integer,
  salary_target integer,
  currency text NOT NULL DEFAULT 'AUD',
  locations text[] NOT NULL DEFAULT '{}',
  work_arrangements text[] NOT NULL DEFAULT '{}',
  work_types text[] NOT NULL DEFAULT '{}',
  mandatory_qualifications text[] NOT NULL DEFAULT '{}',
  dealbreakers text[] NOT NULL DEFAULT '{}',
  verified_experience text,
  policy_strong integer NOT NULL DEFAULT 80,
  policy_review integer NOT NULL DEFAULT 75,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT candidate_preferences_policy_range CHECK (policy_review >= 0 AND policy_review < policy_strong AND policy_strong <= 100)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_preferences TO authenticated;
GRANT ALL ON public.candidate_preferences TO service_role;

ALTER TABLE public.candidate_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences" ON public.candidate_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own preferences" ON public.candidate_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences" ON public.candidate_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own preferences" ON public.candidate_preferences FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_candidate_preferences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidate_preferences_updated_at
BEFORE UPDATE ON public.candidate_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_candidate_preferences_updated_at();

ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS dealbreaker_hits text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS concerns text[] NOT NULL DEFAULT '{}';