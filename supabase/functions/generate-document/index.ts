// Creates an immutable, provenance-carrying document revision (tailored resume
// or cover letter), renders private DOCX + PDF artifacts, and runs the truth
// check server-side. The master resume is never touched.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "npm:docx@8.5.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { requireUser, adminClient, UnauthorizedError } from "../_shared/auth.ts";
import { corsFor, originRejected, preflight } from "../_shared/cors.ts";
import {
  enforceRateLimit,
  readJsonBody,
  RateLimitError,
  PayloadTooLargeError,
} from "../_shared/ratelimit.ts";
import { runTruthCheck, type EvidenceFact } from "../_shared/truthCheck.ts";
import {
  toDocumentContent,
  contentToLines,
  contentHash,
  type DocumentContent,
} from "../_shared/documentContent.ts";

const BUCKET = "documents";

let corsHeaders: Record<string, string> = {};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function renderDocx(content: DocumentContent): Promise<Uint8Array> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(content.title)] }),
  ];
  if (content.subtitle) {
    children.push(new Paragraph({ children: [new TextRun({ text: content.subtitle, italics: true })] }));
  }
  for (const section of content.sections) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(section.heading)] }),
    );
    for (const line of section.lines) {
      children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

async function renderPdf(content: DocumentContent): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const width = 612;
  const height = 792;
  const margin = 56;
  const maxWidth = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const wrap = (text: string, size: number, f: typeof font): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };

  const write = (text: string, size: number, f: typeof font) => {
    for (const line of wrap(text, size, f)) {
      if (y < margin + size) {
        page = pdf.addPage([width, height]);
        y = height - margin;
      }
      page.drawText(line, { x: margin, y, size, font: f, color: rgb(0.1, 0.11, 0.13) });
      y -= size * 1.45;
    }
  };

  write(content.title, 18, bold);
  y -= 6;
  if (content.subtitle) write(content.subtitle, 10, font);
  for (const section of content.sections) {
    y -= 10;
    write(section.heading.toUpperCase(), 12, bold);
    for (const line of section.lines) write(line, 10.5, font);
  }
  return await pdf.save();
}

serve(async (req) => {
  corsHeaders = corsFor(req);
  if (originRejected(req)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const user = await requireUser(req);
    await enforceRateLimit(user.id, "generate-document", 20, 60);

    const body = await readJsonBody<{
      job_id?: string | null;
      document_type?: string;
      content?: unknown;
      label?: string;
      agent_version?: string;
      source_resume_revision_id?: string | null;
      supersedes_revision_id?: string | null;
    }>(req, 512 * 1024);

    const documentType = body.document_type;
    if (documentType !== "resume" && documentType !== "cover_letter") {
      return json({ error: "document_type must be 'resume' or 'cover_letter'" }, 400);
    }
    if (!body.content || typeof body.content !== "object") {
      return json({ error: "content is required" }, 400);
    }

    const db = adminClient();

    // Master resume revision = source of truth. Never mutated here.
    let sourceRevision: { id: string; raw_text: string } | null = null;
    if (body.source_resume_revision_id) {
      const { data } = await db
        .from("resume_revisions")
        .select("id, raw_text")
        .eq("id", body.source_resume_revision_id)
        .eq("user_id", user.id)
        .maybeSingle();
      sourceRevision = data ?? null;
      if (!sourceRevision) return json({ error: "Source resume revision not found" }, 404);
    } else {
      const { data } = await db
        .from("resume_revisions")
        .select("id, raw_text")
        .eq("user_id", user.id)
        .not("approved_at", "is", null)
        .order("revision_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      sourceRevision = data ?? null;
    }

    // Fall back to the uploaded master profile text when no revision exists yet.
    let sourceText = sourceRevision?.raw_text ?? "";
    if (!sourceText) {
      const { data: profile } = await db
        .from("resume_profile")
        .select("raw_text")
        .eq("user_id", user.id)
        .maybeSingle();
      sourceText = profile?.raw_text ?? "";
    }

    const { data: facts } = await db
      .from("candidate_facts")
      .select("id, fact_text, verified")
      .eq("user_id", user.id);

    let job: { id: string; title: string; company: string } | null = null;
    if (body.job_id) {
      const { data } = await db
        .from("jobs")
        .select("id, title, company")
        .eq("id", body.job_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) return json({ error: "Job not found" }, 404);
      job = data;
    }

    const content = toDocumentContent(
      body.content,
      body.label ??
        (documentType === "resume"
          ? `Resume — ${job?.title ?? "General"}`
          : `Cover letter — ${job?.title ?? "General"}`),
    );

    const truth = runTruthCheck({
      content,
      sourceResumeText: sourceText,
      facts: (facts ?? []) as EvidenceFact[],
    });

    const hash = await contentHash(content);

    const { data: previous } = await db
      .from("document_revisions")
      .select("revision_number")
      .eq("user_id", user.id)
      .eq("document_type", documentType)
      .eq("job_id", body.job_id ?? null)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const revisionNumber = (previous?.revision_number ?? 0) + 1;

    const revisionId = crypto.randomUUID();
    const base = `${user.id}/${body.job_id ?? "general"}/${revisionId}`;

    const [docx, pdf] = await Promise.all([renderDocx(content), renderPdf(content)]);

    const uploads = await Promise.all([
      db.storage.from(BUCKET).upload(`${base}.docx`, docx, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      }),
      db.storage.from(BUCKET).upload(`${base}.pdf`, pdf, {
        contentType: "application/pdf",
        upsert: false,
      }),
    ]);
    const uploadError = uploads.find((u) => u.error)?.error;
    if (uploadError) {
      console.error("[generate-document] upload failed:", uploadError.message);
      return json({ error: "Failed to store generated files" }, 500);
    }

    const { data: inserted, error: insertError } = await db
      .from("document_revisions")
      .insert({
        id: revisionId,
        user_id: user.id,
        job_id: body.job_id ?? null,
        document_type: documentType,
        source_resume_revision_id: sourceRevision?.id ?? null,
        revision_number: revisionNumber,
        content: content as unknown as Record<string, unknown>,
        storage_path: `${base}.pdf`,
        docx_path: `${base}.docx`,
        pdf_path: `${base}.pdf`,
        content_hash: hash,
        truth_check_status: truth.status,
        truth_check: truth as unknown as Record<string, unknown>,
        supporting_fact_ids: truth.supporting_fact_ids,
        agent_version: body.agent_version ?? "document_agent/1.0",
        label: content.title,
        approval_status: "pending",
        // Superseding is explicit — regeneration alone never replaces a revision.
        supersedes_revision_id: body.supersedes_revision_id ?? null,
        generated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("[generate-document] insert failed:", insertError.message);
      return json({ error: insertError.message }, 400);
    }

    return json({
      revision: inserted,
      truth_check: truth,
      preview_lines: contentToLines(content),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return json({ error: error.message }, 401);
    if (error instanceof RateLimitError) return json({ error: error.message }, 429);
    if (error instanceof PayloadTooLargeError) return json({ error: error.message }, 413);
    console.error("[generate-document] unexpected error:", error);
    return json({ error: "Unexpected error generating document" }, 500);
  }
});
