import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_PREFERENCES,
  type CandidatePreferences,
} from "@/types/preferences";
import { isValidPolicy } from "@/lib/policy";
import { isGuest, guestFetchPreferences, guestSavePreferences } from "@/lib/guest";

export async function fetchPreferences(): Promise<CandidatePreferences> {
  if (isGuest()) return guestFetchPreferences();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ...EMPTY_PREFERENCES };

  const { data, error } = await supabase
    .from("candidate_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ...EMPTY_PREFERENCES };

  return {
    ...EMPTY_PREFERENCES,
    ...data,
    job_goals: data.job_goals ?? null,
    career_direction: data.career_direction ?? null,
    verified_experience: data.verified_experience ?? null,
  } as CandidatePreferences;
}

export async function savePreferences(
  prefs: CandidatePreferences
): Promise<CandidatePreferences> {
  if (!isValidPolicy(prefs)) {
    throw new Error(
      "Invalid score policy: requires 0 <= Review < Strong Apply <= 100"
    );
  }

  if (isGuest()) return guestSavePreferences(prefs);

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("You must be signed in to save preferences.");

  const row = {
    user_id: userId,
    job_goals: prefs.job_goals,
    career_direction: prefs.career_direction,
    target_titles: prefs.target_titles,
    target_industries: prefs.target_industries,
    excluded_titles: prefs.excluded_titles,
    salary_min: prefs.salary_min,
    salary_target: prefs.salary_target,
    currency: prefs.currency,
    locations: prefs.locations,
    work_arrangements: prefs.work_arrangements,
    work_types: prefs.work_types,
    mandatory_qualifications: prefs.mandatory_qualifications,
    dealbreakers: prefs.dealbreakers,
    verified_experience: prefs.verified_experience,
    policy_strong: prefs.policy_strong,
    policy_review: prefs.policy_review,
  };

  const { data, error } = await supabase
    .from("candidate_preferences")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;
  return { ...EMPTY_PREFERENCES, ...data } as CandidatePreferences;
}
