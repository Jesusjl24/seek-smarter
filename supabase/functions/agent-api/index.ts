import { createClient } from "npm:@supabase/supabase-js@2";
import { AGENT_CORS, ApiError, errorResponse, jsonResponse } from "./errors.ts";
import { authenticate, type Scope } from "./auth.ts";
import { enforceLimits } from "./limits.ts";
import {
  ClaimRequest,
  CompleteRequest,
  DocumentRequest,
  FailRequest,
  HeartbeatRequest,
  RecommendationRequest,
} from "./schemas.ts";
import {
  handleClaim,
  handleComplete,
  handleContext,
  handleDocument,
  handleFail,
  handleHeartbeat,
  handleRecommendation,
  handleMatches,
} from "./handlers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Service-role client is created server-side only and never surfaced in a response.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Route =
  | { kind: "matches" }
  | { kind: "claim" }
  | { kind: "context"; taskId: string }
  | { kind: "heartbeat"; taskId: string }
  | { kind: "recommendation"; taskId: string }
  | { kind: "document"; taskId: string }
  | { kind: "complete"; taskId: string }
  | { kind: "fail"; taskId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function matchRoute(method: string, path: string): { route: Route; scope: Scope } | null {
  const parts = path.replace(/^\/+|\/+$/g, "").split("/");
  // .../v1/tasks/...
  const v1 = parts.indexOf("v1");
  if (v1 === -1) return null;
  const rest = parts.slice(v1 + 1);
  if (rest.length === 1 && rest[0] === "matches" && method === "GET") {
    return { route: { kind: "matches" }, scope: "matches:read" };
  }
  if (rest[0] !== "tasks") return null;

  if (rest.length === 2 && rest[1] === "claim" && method === "POST") {
    return { route: { kind: "claim" }, scope: "tasks:claim" };
  }
  if (rest.length !== 3 || !UUID_RE.test(rest[1])) return null;
  const taskId = rest[1];
  const action = rest[2];

  if (action === "context" && method === "GET") {
    return { route: { kind: "context", taskId }, scope: "context:read" };
  }
  if (method !== "POST") return null;
  switch (action) {
    case "heartbeat":
      return { route: { kind: "heartbeat", taskId }, scope: "runs:heartbeat" };
    case "recommendation":
      return { route: { kind: "recommendation", taskId }, scope: "recommendations:write" };
    case "document":
      return { route: { kind: "document", taskId }, scope: "documents:write" };
    case "complete":
      return { route: { kind: "complete", taskId }, scope: "runs:complete" };
    case "fail":
      return { route: { kind: "fail", taskId }, scope: "runs:complete" };
    default:
      return null;
  }
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } }, raw: string): T {
  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError("invalid_request", "Request body is not valid JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError("invalid_request", "Request body failed validation", result.error);
  }
  return result.data as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: AGENT_CORS });

  const url = new URL(req.url);
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const rawBody = req.method === "GET" ? "" : await req.text();

  try {
    const matched = matchRoute(req.method, url.pathname);
    if (!matched) throw new ApiError("not_found", "Unknown route");

    const identity = await authenticate(admin, req, url.pathname, rawBody, matched.scope);
    await enforceLimits(admin, identity.agentId);

    const isWrite = matched.route.kind !== "context" && matched.route.kind !== "matches";
    if (isWrite && !identity.idempotencyKey) {
      throw new ApiError("invalid_request", "x-idempotency-key header is required for writes");
    }

    // Duplicate write: replay the stored response instead of repeating the work.
    if (isWrite) {
      const { data: prior } = await admin
        .from("agent_request_log")
        .select("status_code, response_json")
        .eq("agent_id", identity.agentId)
        .eq("idempotency_key", identity.idempotencyKey)
        .maybeSingle();
      if (prior) {
        return jsonResponse(prior.response_json, prior.status_code, { "x-idempotent-replay": "true" });
      }
    }

    let payload: unknown;
    switch (matched.route.kind) {
      case "matches": {
        const grade = url.searchParams.get("min_grade") ?? "A";
        if (grade !== "A" && grade !== "B") throw new ApiError("invalid_request", "min_grade must be A or B");
        payload = await handleMatches(admin, identity, url.searchParams.get("since") ?? "", grade);
        break;
      }
      case "claim":
        payload = await handleClaim(admin, identity, parse(ClaimRequest, rawBody));
        break;
      case "context":
        payload = await handleContext(admin, identity, matched.route.taskId);
        break;
      case "heartbeat":
        payload = await handleHeartbeat(admin, identity, matched.route.taskId, parse(HeartbeatRequest, rawBody));
        break;
      case "recommendation":
        payload = await handleRecommendation(admin, identity, matched.route.taskId, parse(RecommendationRequest, rawBody));
        break;
      case "document":
        payload = await handleDocument(admin, identity, matched.route.taskId, parse(DocumentRequest, rawBody));
        break;
      case "complete":
        payload = await handleComplete(admin, identity, matched.route.taskId, parse(CompleteRequest, rawBody));
        break;
      case "fail":
        payload = await handleFail(admin, identity, matched.route.taskId, parse(FailRequest, rawBody));
        break;
    }

    if (isWrite) {
      await admin.from("agent_request_log").insert({
        agent_id: identity.agentId,
        owner_user_id: identity.ownerUserId,
        idempotency_key: identity.idempotencyKey,
        request_id: identity.requestId,
        route: `${req.method} ${url.pathname}`,
        status_code: 200,
        response_json: payload as Record<string, unknown>,
      });
    }

    return jsonResponse(payload, 200);
  } catch (err) {
    if (!(err instanceof ApiError)) {
      console.error("[agent-api] unexpected error", err);
    } else {
      console.log(`[agent-api] ${err.code}: ${err.message} (request_id=${requestId})`);
    }
    return errorResponse(err, requestId);
  }
});
