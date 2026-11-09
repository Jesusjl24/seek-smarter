import { supabase } from "@/integrations/supabase/client";

export async function runSavedSearchesNow() {
  const { data, error } = await supabase.functions.invoke("run-job-pipeline", { body: { force: true } });
  if (error) throw error;
  return data as { totals: number; profiles: Array<{ status: string }> };
}

export async function fetchSearchProfiles() {
  const { data, error } = await supabase.from("search_profiles").select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function createSearchProfile(input: { name: string; target_titles: string[]; locations: string[]; salary_min: number | null }) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You must be signed in.");
  const { data, error } = await supabase.from("search_profiles").insert({ ...input, user_id: auth.user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function setSearchProfileActive(id: string, active: boolean) {
  const { error } = await supabase.from("search_profiles").update({ active }).eq("id", id);
  if (error) throw error;
}
