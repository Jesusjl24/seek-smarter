/** Canonical document content shape shared by resumes and cover letters. */

export interface DocumentSection {
  heading: string;
  lines: string[];
}

export interface DocumentContent {
  title: string;
  subtitle?: string;
  sections: DocumentSection[];
}

/** Best-effort coercion of arbitrary agent output into the canonical shape. */
export function toDocumentContent(
  raw: unknown,
  fallbackTitle = "Document"
): DocumentContent {
  if (raw && typeof raw === "object" && Array.isArray((raw as DocumentContent).sections)) {
    const c = raw as DocumentContent;
    return {
      title: c.title || fallbackTitle,
      subtitle: c.subtitle,
      sections: c.sections.map((s) => ({
        heading: String(s.heading ?? ""),
        lines: (s.lines ?? []).map((l) => String(l)),
      })),
    };
  }

  const sections: DocumentSection[] = [];
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const lines: string[] = [];
      const push = (v: unknown) => {
        if (typeof v === "string" || typeof v === "number") lines.push(String(v));
        else if (Array.isArray(v)) v.forEach(push);
        else if (v && typeof v === "object") Object.values(v).forEach(push);
      };
      push(value);
      if (lines.length) sections.push({ heading: humanise(key), lines });
    }
  } else if (typeof raw === "string") {
    sections.push({ heading: "Content", lines: raw.split(/\n+/).filter(Boolean) });
  }
  return { title: fallbackTitle, sections };
}

function humanise(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Flat plain-text rendering used for diffs and file rendering. */
export function contentToLines(content: DocumentContent): string[] {
  const lines: string[] = [content.title];
  if (content.subtitle) lines.push(content.subtitle);
  for (const section of content.sections) {
    lines.push("");
    lines.push(section.heading.toUpperCase());
    section.lines.forEach((l) => lines.push(l));
  }
  return lines;
}

export function contentToText(content: DocumentContent): string {
  return contentToLines(content).join("\n");
}

/** Stable canonical JSON so the same content always hashes to the same value. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = sort((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

export async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
