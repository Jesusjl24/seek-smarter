// Strict CORS: only the Seek Smarter application origins are allowed.
// Extra origins can be added via the ALLOWED_ORIGINS env var (comma separated).
const STATIC_ORIGINS = [
  "https://id-preview--58351dd2-7db6-447e-b821-74cb73d163d3.lovable.app",
  "https://58351dd2-7db6-447e-b821-74cb73d163d3.lovableproject.com",
  "http://localhost:8080",
  "http://localhost:5173",
];

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

export function allowedOrigins(): string[] {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return [...STATIC_ORIGINS, ...extra];
}

/** CORS headers echoing the request origin only when it is allow-listed. */
export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = allowedOrigins();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/** True when the request carries a browser Origin that is not allow-listed. */
export function originRejected(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return false; // non-browser callers (curl, server-to-server)
  return !allowedOrigins().includes(origin);
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsFor(req) });
}
