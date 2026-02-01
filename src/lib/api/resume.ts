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

export async function uploadResumeFile(
  file: File
): Promise<{ url: string; path: string }> {
  const fileExt = file.name.split(".").pop();
  const fileName = `resume_${Date.now()}.${fileExt}`;
  const filePath = fileName;

  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from("resumes")
    .getPublicUrl(filePath);

  return { url: urlData.publicUrl, path: filePath };
}

export async function saveResumeProfile(
  profile: Omit<ResumeProfile, "id" | "updated_at">
): Promise<ResumeProfile> {
  // First check if a profile exists
  const { data: existing } = await supabase
    .from("resume_profile")
    .select("id")
    .maybeSingle();

  const profileData: Record<string, unknown> = {
    raw_text: profile.raw_text,
    skills_technical: profile.skills_technical,
    skills_soft: profile.skills_soft,
    years_experience: profile.years_experience,
    education: profile.education,
    certifications: profile.certifications,
    previous_titles: profile.previous_titles,
    industries: profile.industries,
    summary: profile.summary,
    file_url: profile.file_url,
    file_name: profile.file_name,
    file_type: profile.file_type,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    // Update existing profile
    const { data, error } = await supabase
      .from("resume_profile")
      .update(profileData)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as ResumeProfile;
  } else {
    // Insert new profile
    const { data, error } = await supabase
      .from("resume_profile")
      .insert(profileData as never)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as ResumeProfile;
  }
}

export async function deleteResumeProfile(profileId: string): Promise<void> {
  // First get the profile to find the file path
  const { data: profile, error: fetchError } = await supabase
    .from("resume_profile")
    .select("file_url")
    .eq("id", profileId)
    .single();

  if (fetchError) throw fetchError;

  // Delete file from storage if it exists
  if (profile?.file_url) {
    const fileName = profile.file_url.split('/').pop();
    if (fileName) {
      await supabase.storage.from("resumes").remove([fileName]);
    }
  }

  // Delete the profile record
  const { error } = await supabase
    .from("resume_profile")
    .delete()
    .eq("id", profileId);

  if (error) throw error;
}
