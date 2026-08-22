import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./errors.ts";

const PER_MINUTE_LIMIT = 60;
const PER_DAY_LIMIT = 2000;

/** Per-agent sliding minute window plus a daily quota. */
export async function enforceLimits(admin: SupabaseClient, agentId: string): Promise<void> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
  const dayStart = now.toISOString().slice(0, 10);

  const { data: row } = await admin
    .from("agent_usage")
    .select("agent_id, window_start, day_start, minute_count, day_count")
    .eq("agent_id", agentId)
    .maybeSingle();

  if (!row) {
    await admin
      .from("agent_usage")
      .insert({ agent_id: agentId, window_start: windowStart, day_start: dayStart, minute_count: 1, day_count: 1 });
    return;
  }

  const sameWindow = new Date(row.window_start).toISOString() === windowStart;
  const sameDay = row.day_start === dayStart;
  const minuteCount = sameWindow ? row.minute_count + 1 : 1;
  const dayCount = sameDay ? row.day_count + 1 : 1;

  if (minuteCount > PER_MINUTE_LIMIT) {
    throw new ApiError("rate_limited", "Per-minute rate limit exceeded");
  }
  if (dayCount > PER_DAY_LIMIT) {
    throw new ApiError("rate_limited", "Daily quota exceeded");
  }

  await admin
    .from("agent_usage")
    .update({ window_start: windowStart, day_start: dayStart, minute_count: minuteCount, day_count: dayCount })
    .eq("agent_id", agentId);
}
