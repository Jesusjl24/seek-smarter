import { supabase } from "@/integrations/supabase/client";
import type { ResumeProfile } from "@/types/job";
import { isGuest, guestFetchProfile, guestDeleteProfile } from "@/lib/guest";

const RESUME_BUCKET = "resumes";
const SIGNED_URL_TTL_SECONDS = 300; // short-lived

const ALLOWED_RESUME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const MAX_RESUME_BYTES = 10 * 1024 * 1024;

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You must be signed in to do that.");
  return data.user.id;
}

/** Strips path traversal and unsafe characters from an uploaded file name. */
function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "resume";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned.slice(0, 120) || "resume";
}

export async function fetchResumeProfile(): Promise<ResumeProfile | null> {
  if (isGuest()) return guestFetchProfile();
  const { data, error } = await supabase
    .from("resume_profile")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as ResumeProfile | null;
}

/**
 * Uploads a resume to a user-scoped path: <user_id>/<revision_id>/<safe_filename>.
 * The bucket is private — access is only ever granted via short-lived signed URLs.
 */
export async function uploadResumeFile(file: File): Promise<{ path: string }> {
  if (isGuest()) throw new Error("Guest mode does not upload files.");

  if (!ALLOWED_RESUME_TYPES.includes(file.type)) {
    throw new Error("Unsupported file type. Upload a PDF, DOCX, or TXT file.");
  }
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error("File too large. Maximum size is 10MB.");
  }

  const userId = await requireUserId();
  const revisionId = crypto.randomUUID();
  const filePath = `${userId}/${revisionId}/${safeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(RESUME_BUCKET)
    .upload(filePath, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (uploadError) throw uploadError;
  return { path: filePath };
}

/** Returns a short-lived signed URL for a stored resume, or null when there is no file. */
export async function getResumeSignedUrl(
  profile: Pick<ResumeProfile, "file_path"> | null
): Promise<string | null> {
  if (isGuest()) return null;
  if (!profile?.file_path) return null;

  const { data, error } = await supabase.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(profile.file_path, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function saveResumeProfile(
  profile: Omit<ResumeProfile, "id" | "updated_at">
): Promise<ResumeProfile> {
  const userId = await requireUserId();

  const { data: existing } = await supabase
    .from("resume_profile")
    .select("id")
    .maybeSingle();

  const profileData: Record<string, unknown> = {
    user_id: userId,
    raw_text: profile.raw_text,
    skills_technical: profile.skills_technical,
    skills_soft: profile.skills_soft,
    years_experience: profile.years_experience,
    education: profile.education,
    certifications: profile.certifications,
    previous_titles: profile.previous_titles,
    industries: profile.industries,
    summary: profile.summary,
    file_path: profile.file_path ?? null,
    file_name: profile.file_name,
    file_type: profile.file_type,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("resume_profile")
      .update(profileData as never)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as ResumeProfile;
  }

  const { data, error } = await supabase
    .from("resume_profile")
    .insert(profileData as never)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as ResumeProfile;
}

export async function deleteResumeProfile(profileId: string): Promise<void> {
  if (isGuest()) { guestDeleteProfile(); return; }
  const { data: profile, error: fetchError } = await supabase
    .from("resume_profile")
    .select("file_path")
    .eq("id", profileId)
    .single();

  if (fetchError) throw fetchError;

  const filePath = (profile as { file_path?: string | null } | null)?.file_path;
  if (filePath) {
    await supabase.storage.from(RESUME_BUCKET).remove([filePath]);
  }

  const { error } = await supabase
    .from("resume_profile")
    .delete()
    .eq("id", profileId);

  if (error) throw error;
}
