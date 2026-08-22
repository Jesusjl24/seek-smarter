/**
 * Shared protocol helpers for the Hermes agent API.
 * Pure functions: canonical signing string, body hashing, scope checks and
 * credential freshness. Kept framework-free so both the browser tooling and
 * the tests can use them. No secrets are stored here.
 */

export const AGENT_SCOPES = [
  "tasks:claim",
  "context:read",
  "recommendations:write",
  "documents:write",
  "runs:heartbeat",
  "runs:complete",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

export const AGENT_SCHEMA_VERSION = "1.0";

export const MAX_CLOCK_SKEW_SECONDS = 120;

export const ROUTE_SCOPES: Record<string, AgentScope> = {
  "POST /v1/tasks/claim": "tasks:claim",
  "GET /v1/tasks/:task_id/context": "context:read",
  "POST /v1/tasks/:task_id/heartbeat": "runs:heartbeat",
  "POST /v1/tasks/:task_id/recommendation": "recommendations:write",
  "POST /v1/tasks/:task_id/document": "documents:write",
  "POST /v1/tasks/:task_id/complete": "runs:complete",
  "POST /v1/tasks/:task_id/fail": "runs:complete",
};

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export function canonicalString(
  method: string,
  path: string,
  timestamp: string | number,
  nonce: string,
  bodyHash: string,
): string {
  return [method.toUpperCase(), path, String(timestamp), nonce, bodyHash].join("\n");
}

export function hasScope(scopes: readonly string[], required: AgentScope): boolean {
  return scopes.includes(required);
}

export function isTimestampFresh(timestamp: number, nowSeconds: number): boolean {
  return Math.abs(nowSeconds - timestamp) <= MAX_CLOCK_SKEW_SECONDS;
}

export interface CredentialState {
  revoked_at: string | null;
  expires_at: string;
}

export function isCredentialUsable(cred: CredentialState, now: Date = new Date()): boolean {
  if (cred.revoked_at) return false;
  return new Date(cred.expires_at).getTime() > now.getTime();
}

export interface LeaseState {
  lease_owner: string | null;
  status: string;
  lease_expires_at: string | null;
}

export function isLeaseHeldBy(lease: LeaseState, agentId: string, now: Date = new Date()): boolean {
  if (lease.lease_owner !== agentId) return false;
  if (lease.status !== "leased") return false;
  if (!lease.lease_expires_at) return false;
  return new Date(lease.lease_expires_at).getTime() > now.getTime();
}

/** Fields every write to the agent API must carry. */
export const WRITE_ENVELOPE_FIELDS = [
  "request_id",
  "idempotency_key",
  "agent_id",
  "run_id",
  "task_id",
  "schema_version",
  "input_snapshot_hash",
  "agent_version",
] as const;

export function missingEnvelopeFields(body: Record<string, unknown>): string[] {
  return WRITE_ENVELOPE_FIELDS.filter(
    (f) => body[f] === undefined || body[f] === null || body[f] === "",
  );
}

export async function signRequest(params: {
  method: string;
  path: string;
  body: string;
  signingKey: string;
  nonce: string;
  timestamp?: number;
}): Promise<Record<string, string>> {
  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000);
  const bodyHash = await sha256Hex(params.body);
  const signature = await hmacHex(
    params.signingKey,
    canonicalString(params.method, params.path, timestamp, params.nonce, bodyHash),
  );
  return {
    "x-agent-timestamp": String(timestamp),
    "x-agent-nonce": params.nonce,
    "x-body-sha256": bodyHash,
    "x-agent-signature": signature,
  };
}
