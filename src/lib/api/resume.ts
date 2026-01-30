import { supabase } from "@/integrations/supabase/client";
import type { ResumeProfile } from "@/types/job";

export async function fetchResumeProfile(): Promise<ResumeProfile | null> {
  const { data, error } = await supabase
    .from("resume_profile")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as ResumeProfile | null;
}

export async function saveResumeProfile(
  profile: Omit<ResumeProfile, "id" | "updated_at">
): Promise<ResumeProfile> {
  // First check if a profile exists
  const { data: existing } = await supabase
    .from("resume_profile")
    .select("id")
    .maybeSingle();

  if (existing) {
    // Update existing profile
    const { data, error } = await supabase
      .from("resume_profile")
      .update({
        ...profile,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw error;
    return data as ResumeProfile;
  } else {
    // Insert new profile
    const { data, error } = await supabase
      .from("resume_profile")
      .insert(profile)
      .select()
      .single();

    if (error) throw error;
    return data as ResumeProfile;
  }
}
