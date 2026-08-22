import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Contract tests for the agent-api edge function.
 *
 * These run against the deployed function. Provisioning a live machine
 * credential requires a service-role insert into `agent_credentials`, which is
 * not available from this test context — so the credential-dependent flows are
 * exercised as far as the auth boundary allows. Every test below asserts the
 * public contract: unauthenticated and malformed requests must be rejected
 * before any data is touched, and unknown routes must not exist.
 */

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const BASE = `${SUPABASE_URL}/functions/v1/agent-api`;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-agent-id": "hermes-job-assistant",
    "x-agent-key-id": "key_does_not_exist",
    "x-agent-timestamp": String(Math.floor(Date.now() / 1000)),
    "x-agent-nonce": crypto.randomUUID(),
    "x-agent-signature": "00".repeat(32),
    "x-request-id": crypto.randomUUID(),
    "x-idempotency-key": crypto.randomUUID(),
    ...extra,
  };
}

async function call(path: string, init: RequestInit & { body?: string } = {}) {
  const body = init.body ?? "";
  const headers = {
    ...baseHeaders({ "x-body-sha256": await sha256Hex(body) }),
    ...(init.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers, body: init.method === "GET" ? undefined : body });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch { /* non-JSON body */ }
  return { status: res.status, json };
}

const TASK = "33333333-3333-3333-3333-333333333333";

Deno.test("CORS preflight is allowed", async () => {
  const res = await fetch(`${BASE}/v1/tasks/claim`, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 204);
});

Deno.test("invalid credentials are rejected", async () => {
  const { status, json } = await call("/v1/tasks/claim", { method: "POST", body: "{}" });
  assertEquals(status, 401);
  assertEquals((json.error as Record<string, string>).code, "unauthorized");
});

Deno.test("missing auth headers are rejected before any work", async () => {
  const res = await fetch(`${BASE}/v1/tasks/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  assertEquals(res.status, 401);
  assertEquals(json.error.code, "unauthorized");
});

Deno.test("expired credentials (stale timestamp) are rejected", async () => {
  const { status, json } = await call("/v1/tasks/claim", {
    method: "POST",
    body: "{}",
    headers: { "x-agent-timestamp": String(Math.floor(Date.now() / 1000) - 3600) },
  });
  assertEquals(status, 401);
  assertEquals((json.error as Record<string, string>).code, "expired_credential");
});

Deno.test("tampered body hash is rejected", async () => {
  const { status, json } = await call("/v1/tasks/claim", {
    method: "POST",
    body: '{"max_tasks":1}',
    headers: { "x-body-sha256": await sha256Hex("{}") },
  });
  assertEquals(status, 401);
  assertEquals((json.error as Record<string, string>).code, "unauthorized");
});

Deno.test("wrong owner / unknown task cannot be read without a valid credential", async () => {
  const { status } = await call(`/v1/tasks/${TASK}/context`, { method: "GET" });
  assertEquals(status, 401);
});

Deno.test("wrong scope route still requires authentication first", async () => {
  const { status } = await call(`/v1/tasks/${TASK}/document`, { method: "POST", body: "{}" });
  assertEquals(status, 401);
});

Deno.test("duplicate request replay is gated behind authentication", async () => {
  const idem = crypto.randomUUID();
  const first = await call(`/v1/tasks/${TASK}/complete`, {
    method: "POST",
    body: "{}",
    headers: { "x-idempotency-key": idem },
  });
  const second = await call(`/v1/tasks/${TASK}/complete`, {
    method: "POST",
    body: "{}",
    headers: { "x-idempotency-key": idem },
  });
  assertEquals(first.status, 401);
  assertEquals(second.status, 401);
});

Deno.test("no generic CRUD, SQL or submit routes exist", async () => {
  for (const path of ["/v1/query", "/v1/tables/jobs", "/v1/tasks/submit", "/v1/apply"]) {
    const { status, json } = await call(path, { method: "POST", body: "{}" });
    // Unknown routes fail closed: never 200, never a data payload.
    assertEquals(status === 404 || status === 401, true);
    assertEquals(json.data, undefined);
  }
});

Deno.test("failure responses are safe: no secrets or stack traces leak", async () => {
  const { json } = await call("/v1/tasks/claim", { method: "POST", body: "{}" });
  const serialized = JSON.stringify(json);
  for (const needle of ["service_role", "SUPABASE_SERVICE_ROLE_KEY", "secret_hash", "eyJ"]) {
    assertEquals(serialized.includes(needle), false);
  }
});
