/** User-facing provider error messages. Never include keys or raw upstream bodies. */
export function isAuthFailure(status: number, bodyText = ""): boolean {
  if (status === 401 || status === 403) return true;
  if (status === 400 && /incorrect|invalid|unauthorized|api[_ ]?key|authentication/i.test(bodyText)) return true;
  return false;
}

export function providerErrorMessage(provider: "Firecrawl" | "xAI" | "OpenAI-compatible" | "Gemini", status: number, bodyText = ""): string {
  if (isAuthFailure(status, bodyText)) return `${provider} key rejected (${status})`;
  return `${provider} request failed (${status})`;
}

export async function peekErrorBody(response: Response, limit = 400): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, limit);
  } catch {
    return "";
  }
}

export class ProviderRequestError extends Error {
  status?: number;
  source?: string;
  possibleBlocking: boolean;
  constructor(message: string, opts: { status?: number; source?: string; possibleBlocking?: boolean } = {}) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = opts.status;
    this.source = opts.source;
    this.possibleBlocking = opts.possibleBlocking ?? false;
  }
}

/** Strip tokens and long secrets from a message that may be shown in an API or briefing. */
export function sanitizePublicError(message: string): string {
  return String(message ?? "")
    .replace(/\bBearer\s+[A-Za-z0-9._\-+=\/]+/gi, "Bearer [redacted]")
    .replace(/\b(?:authorization|api[_-]?key)\s*[:=]\s*["']?[^\s"',}]+/gi, (match) => match.split(/[:=]/)[0] + "=[redacted]")
    .replace(/\b(?:sk-|xai-|fc-)[A-Za-z0-9._-]{8,}/g, "[redacted]")
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[redacted]")
    .trim();
}

export function uniqueSanitizedReasons(reasons: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const reason of reasons) {
    const clean = sanitizePublicError(String(reason ?? ""));
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}
