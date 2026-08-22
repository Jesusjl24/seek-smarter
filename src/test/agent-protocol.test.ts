import { describe, expect, it } from "vitest";
import {
  AGENT_SCHEMA_VERSION,
  ROUTE_SCOPES,
  canonicalString,
  hasScope,
  hmacHex,
  isCredentialUsable,
  isLeaseHeldBy,
  isTimestampFresh,
  missingEnvelopeFields,
  sha256Hex,
  signRequest,
} from "@/lib/assistant/agentProtocol";

const SIGNING_KEY = "0123456789abcdef0123456789abcdef";
const AGENT = "hermes-job-assistant";
const NOW = new Date("2026-08-22T10:00:00.000Z");

describe("request signing", () => {
  it("signs a canonical string that both sides can reproduce", async () => {
    const body = JSON.stringify({ hello: "world" });
    const headers = await signRequest({
      method: "post",
      path: "/agent-api/v1/tasks/claim",
      body,
      signingKey: SIGNING_KEY,
      nonce: "nonce-1",
      timestamp: 1770000000,
    });
    const expected = await hmacHex(
      SIGNING_KEY,
      canonicalString("POST", "/agent-api/v1/tasks/claim", 1770000000, "nonce-1", await sha256Hex(body)),
    );
    expect(headers["x-agent-signature"]).toBe(expected);
    expect(headers["x-body-sha256"]).toBe(await sha256Hex(body));
  });

  it("produces a different signature when the body changes (tamper detection)", async () => {
    const a = await signRequest({ method: "POST", path: "/p", body: "{}", signingKey: SIGNING_KEY, nonce: "n", timestamp: 1 });
    const b = await signRequest({ method: "POST", path: "/p", body: '{"x":1}', signingKey: SIGNING_KEY, nonce: "n", timestamp: 1 });
    expect(a["x-agent-signature"]).not.toBe(b["x-agent-signature"]);
  });

  it("produces a different signature for a different key (invalid credential)", async () => {
    const good = await signRequest({ method: "POST", path: "/p", body: "{}", signingKey: SIGNING_KEY, nonce: "n", timestamp: 1 });
    const bad = await signRequest({ method: "POST", path: "/p", body: "{}", signingKey: "wrong-key", nonce: "n", timestamp: 1 });
    expect(bad["x-agent-signature"]).not.toBe(good["x-agent-signature"]);
  });

  it("binds the nonce into the signature so a replay with a new nonce fails", async () => {
    const a = await signRequest({ method: "POST", path: "/p", body: "{}", signingKey: SIGNING_KEY, nonce: "n1", timestamp: 1 });
    const b = await signRequest({ method: "POST", path: "/p", body: "{}", signingKey: SIGNING_KEY, nonce: "n2", timestamp: 1 });
    expect(a["x-agent-signature"]).not.toBe(b["x-agent-signature"]);
  });
});

describe("expiry and freshness", () => {
  const now = Math.floor(NOW.getTime() / 1000);

  it("accepts fresh timestamps and rejects stale ones", () => {
    expect(isTimestampFresh(now, now)).toBe(true);
    expect(isTimestampFresh(now - 119, now)).toBe(true);
    expect(isTimestampFresh(now - 600, now)).toBe(false);
    expect(isTimestampFresh(now + 600, now)).toBe(false);
  });

  it("rejects revoked and expired credentials", () => {
    expect(isCredentialUsable({ revoked_at: null, expires_at: "2026-12-01T00:00:00Z" }, NOW)).toBe(true);
    expect(isCredentialUsable({ revoked_at: "2026-08-01T00:00:00Z", expires_at: "2026-12-01T00:00:00Z" }, NOW)).toBe(false);
    expect(isCredentialUsable({ revoked_at: null, expires_at: "2026-01-01T00:00:00Z" }, NOW)).toBe(false);
  });
});

describe("scopes", () => {
  it("maps each route to its narrow scope", () => {
    expect(ROUTE_SCOPES["POST /v1/tasks/claim"]).toBe("tasks:claim");
    expect(ROUTE_SCOPES["GET /v1/tasks/:task_id/context"]).toBe("context:read");
    expect(ROUTE_SCOPES["POST /v1/tasks/:task_id/document"]).toBe("documents:write");
  });

  it("rejects a credential missing the required scope", () => {
    expect(hasScope(["context:read"], "documents:write")).toBe(false);
    expect(hasScope(["context:read", "documents:write"], "documents:write")).toBe(true);
  });
});

describe("lease state", () => {
  it("accepts a live lease held by this agent", () => {
    expect(
      isLeaseHeldBy({ lease_owner: AGENT, status: "leased", lease_expires_at: "2026-08-22T10:05:00Z" }, AGENT, NOW),
    ).toBe(true);
  });

  it("rejects stale, foreign or released leases", () => {
    expect(
      isLeaseHeldBy({ lease_owner: AGENT, status: "leased", lease_expires_at: "2026-08-22T09:55:00Z" }, AGENT, NOW),
    ).toBe(false);
    expect(
      isLeaseHeldBy({ lease_owner: "other-agent", status: "leased", lease_expires_at: "2026-08-22T10:05:00Z" }, AGENT, NOW),
    ).toBe(false);
    expect(
      isLeaseHeldBy({ lease_owner: AGENT, status: "succeeded", lease_expires_at: "2026-08-22T10:05:00Z" }, AGENT, NOW),
    ).toBe(false);
  });
});

describe("write envelope", () => {
  const envelope = {
    request_id: "req-1",
    idempotency_key: "idem-12345678",
    agent_id: AGENT,
    run_id: "11111111-1111-1111-1111-111111111111",
    task_id: "22222222-2222-2222-2222-222222222222",
    schema_version: AGENT_SCHEMA_VERSION,
    input_snapshot_hash: "hash-abcdefg",
    agent_version: "1.0.0",
  };

  it("accepts a complete envelope", () => {
    expect(missingEnvelopeFields(envelope)).toEqual([]);
  });

  it("reports every missing field", () => {
    const { idempotency_key: _i, input_snapshot_hash: _h, ...partial } = envelope;
    expect(missingEnvelopeFields(partial)).toEqual(["idempotency_key", "input_snapshot_hash"]);
  });
});
