import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

export const AGENT_CORS = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    "content-type, x-agent-id, x-agent-key-id, x-agent-timestamp, x-agent-nonce, x-agent-signature, x-body-sha256, x-request-id, x-idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export type ErrorCode =
  | "unauthorized"
  | "forbidden_scope"
  | "expired_credential"
  | "replay_detected"
  | "not_found"
  | "lease_lost"
  | "stale_snapshot"
  | "invalid_request"
  | "rate_limited"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden_scope: 403,
  expired_credential: 401,
  replay_detected: 409,
  not_found: 404,
  lease_lost: 409,
  stale_snapshot: 409,
  invalid_request: 400,
  rate_limited: 429,
  internal_error: 500,
};

export class ApiError extends Error {
  code: ErrorCode;
  details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...AGENT_CORS, "Content-Type": "application/json", ...extraHeaders },
  });
}

export function errorResponse(err: unknown, requestId: string) {
  const apiError =
    err instanceof ApiError ? err : new ApiError("internal_error", "Unexpected server error");
  const status = STATUS[apiError.code];
  return jsonResponse(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        request_id: requestId,
        ...(apiError.details ? { details: apiError.details } : {}),
      },
    },
    status,
    apiError.code === "rate_limited" ? { "Retry-After": "60" } : {},
  );
}
