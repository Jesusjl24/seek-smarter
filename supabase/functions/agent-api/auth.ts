import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./errors.ts";

export const SCOPES = [
  "tasks:claim",
  "context:read",
  "recommendations:write",
  "documents:write",
  "runs:heartbeat",
  "runs:complete",
] as const;
export type Scope = (typeof SCOPES)[number];

const MAX_CLOCK_SKEW_SECONDS = 120;
const NONCE_TTL_MINUTES = 10;

export interface AgentIdentity {
  agentId: string;
  keyId: string;
  ownerUserId: string;
  scopes: string[];
  requestId: string;
  idempotencyKey: string;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function canonicalString(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  bodyHash: string,
): string {
  return [method.toUpperCase(), path, timestamp, nonce, bodyHash].join("\n");
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies the machine identity for a request:
 * key lookup -> revocation -> expiry -> signature -> freshness -> replay -> scope.
 */
export async function authenticate(
  admin: SupabaseClient,
  req: Request,
  path: string,
  rawBody: string,
  requiredScope: Scope,
): Promise<AgentIdentity> {
  const h = (name: string) => req.headers.get(name)?.trim() ?? "";
  const keyId = h("x-agent-key-id");
  const agentId = h("x-agent-id");
  const timestamp = h("x-agent-timestamp");
  const nonce = h("x-agent-nonce");
  const signature = h("x-agent-signature");
  const bodyHash = h("x-body-sha256");
  const requestId = h("x-request-id");
  const idempotencyKey = h("x-idempotency-key");

  if (!keyId || !agentId || !timestamp || !nonce || !signature || !bodyHash || !requestId) {
    throw new ApiError("unauthorized", "Missing required agent authentication headers");
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    throw new ApiError("unauthorized", "Invalid timestamp header");
  }
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > MAX_CLOCK_SKEW_SECONDS) {
    throw new ApiError("expired_credential", "Request timestamp outside the allowed window");
  }

  const expectedBodyHash = await sha256Hex(rawBody);
  if (!timingSafeEqual(expectedBodyHash, bodyHash.toLowerCase())) {
    throw new ApiError("unauthorized", "Body hash does not match request body");
  }

  const { data: cred } = await admin
    .from("agent_credentials")
    .select("agent_id, key_id, secret_hash, owner_user_id, scopes, expires_at, revoked_at")
    .eq("key_id", keyId)
    .maybeSingle();

  if (!cred) throw new ApiError("unauthorized", "Unknown key id");
  if (cred.agent_id !== agentId) throw new ApiError("unauthorized", "Key does not belong to agent");
  if (cred.revoked_at) throw new ApiError("expired_credential", "Credential has been revoked");
  if (new Date(cred.expires_at).getTime() <= Date.now()) {
    throw new ApiError("expired_credential", "Credential has expired");
  }

  // The stored secret_hash is sha256(secret); the signing key is that same digest,
  // so the raw secret never has to exist server-side.
  const expectedSig = await hmacHex(
    cred.secret_hash,
    canonicalString(req.method, path, timestamp, nonce, bodyHash.toLowerCase()),
  );
  if (!timingSafeEqual(expectedSig, signature.toLowerCase())) {
    throw new ApiError("unauthorized", "Invalid request signature");
  }

  const { error: nonceError } = await admin
    .from("agent_nonces")
    .insert({ key_id: keyId, nonce });
  if (nonceError) {
    if (nonceError.code === "23505") {
      throw new ApiError("replay_detected", "Nonce has already been used");
    }
    throw new ApiError("internal_error", "Could not record request nonce");
  }

  // Opportunistic prune of expired nonces.
  await admin
    .from("agent_nonces")
    .delete()
    .lt("seen_at", new Date(Date.now() - NONCE_TTL_MINUTES * 60_000).toISOString());

  if (!Array.isArray(cred.scopes) || !cred.scopes.includes(requiredScope)) {
    throw new ApiError("forbidden_scope", `Missing required scope ${requiredScope}`);
  }

  await admin
    .from("agent_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_id", keyId);

  return {
    agentId,
    keyId,
    ownerUserId: cred.owner_user_id,
    scopes: cred.scopes,
    requestId,
    idempotencyKey,
  };
}
