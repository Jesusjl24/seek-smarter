// Resolves the caller from the Authorization header. The resolved user id is the
// ONLY accepted identity — request bodies never carry a user_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

export interface AuthedUser {
  id: string;
  email?: string;
}

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function requireUser(req: Request): Promise<AuthedUser> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!token) throw new UnauthorizedError("Missing Authorization bearer token");

  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) throw new UnauthorizedError("Invalid or expired token");
  return { id: data.user.id, email: data.user.email ?? undefined };
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Loads the caller's preferences server-side. Returns null when none saved. */
export async function loadPreferences(userId: string) {
  const { data, error } = await adminClient()
    .from("candidate_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[auth] failed to load preferences:", error.message);
    return null;
  }
  return data;
}
