import { adminClient } from "./auth.ts";

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Fixed-window per-user rate limit backed by public.rate_limits.
 * Fails open on infrastructure errors so a DB blip cannot lock users out.
 */
export async function enforceRateLimit(
  userId: string,
  endpoint: string,
  limit: number,
  windowSeconds = 60,
): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(
    Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000,
  ).toISOString();

  const db = adminClient();
  const { data, error } = await db
    .from("rate_limits")
    .select("request_count")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .eq("window_start", windowStart)
    .maybeSingle();

  if (error) {
    console.error("[ratelimit] lookup failed:", error.message);
    return;
  }

  const count = data?.request_count ?? 0;
  if (count >= limit) {
    throw new RateLimitError(
      `Rate limit reached for ${endpoint}. Try again in a moment.`,
    );
  }

  const { error: upsertError } = await db.from("rate_limits").upsert(
    {
      user_id: userId,
      endpoint,
      window_start: windowStart,
      request_count: count + 1,
    },
    { onConflict: "user_id,endpoint,window_start" },
  );
  if (upsertError) console.error("[ratelimit] upsert failed:", upsertError.message);
}

/** Rejects oversized request bodies before parsing them. */
export async function readJsonBody<T>(req: Request, maxBytes: number): Promise<T> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared && declared > maxBytes) {
    throw new PayloadTooLargeError(`Request body exceeds ${maxBytes} bytes`);
  }
  const raw = await req.text();
  if (raw.length > maxBytes) {
    throw new PayloadTooLargeError(`Request body exceeds ${maxBytes} bytes`);
  }
  return JSON.parse(raw) as T;
}

export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}
