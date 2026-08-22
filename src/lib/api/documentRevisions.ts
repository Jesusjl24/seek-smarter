// Application-document workflow API: immutable revisions, truth checks,
// signed private downloads and application packages.

import { supabase } from "@/integrations/supabase/client";
import { isGuest } from "@/lib/guest";
import { contentHash, toDocumentContent, type DocumentContent } from "@/lib/documents/content";
import type { TruthCheckResult, TruthCheckStatus } from "@/lib/documents/truthCheck";
import type { DocumentRevision, ApplicationPackage, CandidateFact } from "@/types/assistant";

const BUCKET = "documents";
const SIGNED_URL_TTL_SECONDS = 120;

export interface JobRef {
  id: string;
  title: string;
  company: string;
}

export interface RevisionWithJob extends DocumentRevision {
  job?: JobRef | null;
}

export interface DocumentWorkspace {
  master: {
    revision_id: string | null;
    revision_number: number | null;
    raw_text: string;
    approved_at: string | null;
    file_name: string | null;
    updated_at: string | null;
  } | null;
  tailoredResumes: RevisionWithJob[];
  coverLetters: RevisionWithJob[];
  packages: ApplicationPackage[];
  facts: CandidateFact[];
  jobs: JobRef[];
}

const EMPTY_WORKSPACE: DocumentWorkspace = {
  master: null,
  tailoredResumes: [],
  coverLetters: [],
  packages: [],
  facts: [],
  jobs: [],
};

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You must be signed in to do that.");
  return data.user.id;
}

export async function fetchDocumentWorkspace(): Promise<DocumentWorkspace> {
  if (isGuest()) return EMPTY_WORKSPACE;

  const [revisionsRes, masterRevRes, profileRes, packagesRes, factsRes, jobsRes] =
    await Promise.all([
      supabase
        .from("document_revisions")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("resume_revisions")
        .select("id, revision_number, raw_text, approved_at")
        .order("revision_number", { ascending: false })
        .limit(1),
      supabase.from("resume_profile").select("raw_text, file_name, updated_at").maybeSingle(),
      supabase.from("application_packages").select("*"),
      supabase.from("candidate_facts").select("*"),
      supabase.from("jobs").select("id, title, company"),
    ]);

  if (revisionsRes.error) throw revisionsRes.error;

  const jobs = (jobsRes.data ?? []) as JobRef[];
  const byJob = new Map(jobs.map((j) => [j.id, j]));
  const revisions = ((revisionsRes.data ?? []) as DocumentRevision[]).map((r) => ({
    ...r,
    job: r.job_id ? byJob.get(r.job_id) ?? null : null,
  }));

  const masterRev = masterRevRes.data?.[0] ?? null;
  const profile = profileRes.data ?? null;

  return {
    master:
      masterRev || profile
        ? {
            revision_id: masterRev?.id ?? null,
            revision_number: masterRev?.revision_number ?? null,
            raw_text: masterRev?.raw_text ?? profile?.raw_text ?? "",
            approved_at: masterRev?.approved_at ?? null,
            file_name: profile?.file_name ?? null,
            updated_at: profile?.updated_at ?? null,
          }
        : null,
    tailoredResumes: revisions.filter((r) => r.document_type === "resume"),
    coverLetters: revisions.filter((r) => r.document_type === "cover_letter"),
    packages: (packagesRes.data ?? []) as ApplicationPackage[],
    facts: (factsRes.data ?? []) as CandidateFact[],
    jobs,
  };
}

export interface GenerateDocumentInput {
  jobId: string | null;
  documentType: "resume" | "cover_letter";
  content: unknown;
  label?: string;
  agentVersion?: string;
  sourceResumeRevisionId?: string | null;
  /** Only set when the user explicitly chooses to supersede an older revision. */
  supersedesRevisionId?: string | null;
}

export interface GenerateDocumentResult {
  revision: DocumentRevision;
  truth_check: TruthCheckResult;
  preview_lines: string[];
}

/**
 * Always creates a NEW revision. The master resume is never written to.
 */
export async function generateDocumentRevision(
  input: GenerateDocumentInput
): Promise<GenerateDocumentResult> {
  if (isGuest()) throw new Error("Guest mode cannot generate stored documents.");
  const { data, error } = await supabase.functions.invoke("generate-document", {
    body: {
      job_id: input.jobId,
      document_type: input.documentType,
      content: input.content,
      label: input.label,
      agent_version: input.agentVersion,
      source_resume_revision_id: input.sourceResumeRevisionId ?? null,
      supersedes_revision_id: input.supersedesRevisionId ?? null,
    },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as GenerateDocumentResult;
}

/**
 * Bridge for AI agent output (tailor-resume / generate-cover-letter):
 * stores the result as a new immutable, truth-checked revision.
 * Best-effort — a storage failure must not lose the generated content on screen.
 */
export async function recordAgentDocument(
  jobId: string,
  documentType: "resume" | "cover_letter",
  content: unknown,
  agentVersion: string
): Promise<GenerateDocumentResult | null> {
  if (isGuest()) return null;
  try {
    return await generateDocumentRevision({
      jobId,
      documentType,
      content,
      agentVersion,
    });
  } catch (err) {
    console.error("[documents] failed to store agent revision", err);
    return null;
  }
}

/** Marks the truth check as manually accepted by the owner (audited). */
export async function manuallyApproveTruthCheck(
  revisionId: string
): Promise<void> {
  await requireUserId();
  const { error } = await supabase
    .from("document_revisions")
    .update({ truth_check_status: "manually_approved" })
    .eq("id", revisionId);
  if (error) throw error;
}

/** Approve a document revision. Blocked server-side if the truth check failed. */
export async function approveDocumentRevision(
  revisionId: string,
  expectedHash: string,
  comment?: string
) {
  const { data, error } = await supabase.rpc("record_approval_decision", {
    _entity_type: "document_revision",
    _entity_id: revisionId,
    _decision: "approved",
    _expected_hash: expectedHash,
    _comment: comment ?? null,
  });
  if (error) throw error;
  return data;
}

/** Request an edit = reject this revision with a reason. Nothing else changes. */
export async function requestDocumentEdit(
  revisionId: string,
  expectedHash: string,
  comment: string
) {
  const { data, error } = await supabase.rpc("record_approval_decision", {
    _entity_type: "document_revision",
    _entity_id: revisionId,
    _decision: "rejected",
    _expected_hash: expectedHash,
    _comment: comment,
  });
  if (error) throw error;
  return data;
}

/** Signed, short-lived download. Storage RLS restricts objects to the owner. */
export async function signedDocumentUrl(path: string): Promise<string> {
  const userId = await requireUserId();
  if (!path.startsWith(`${userId}/`)) {
    throw new Error("You can only download your own documents.");
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: true });
  if (error) throw error;
  return data.signedUrl;
}

export interface PackageInput {
  jobId: string;
  resumeRevision?: DocumentRevision | null;
  coverLetterRevision?: DocumentRevision | null;
}

/** Deterministic package hash pinned to the exact approved content hashes. */
export async function buildPackageHash(input: {
  jobId: string;
  resumeHash: string | null;
  coverLetterHash: string | null;
}): Promise<string> {
  return contentHash([input.jobId, input.resumeHash, input.coverLetterHash]);
}

/**
 * Attaches approved documents to the job's application package.
 * Only approved revisions may be referenced.
 */
export async function attachToApplicationPackage(
  input: PackageInput
): Promise<ApplicationPackage> {
  const userId = await requireUserId();
  const resume = input.resumeRevision ?? null;
  const letter = input.coverLetterRevision ?? null;

  for (const rev of [resume, letter]) {
    if (rev && rev.approval_status !== "approved") {
      throw new Error("Only approved document revisions can be attached to a package.");
    }
  }

  const packageHash = await buildPackageHash({
    jobId: input.jobId,
    resumeHash: resume?.content_hash ?? null,
    coverLetterHash: letter?.content_hash ?? null,
  });

  const checklist = [
    { item: "Tailored resume approved", done: !!resume },
    { item: "Cover letter approved", done: !!letter },
  ];

  const { data: existing } = await supabase
    .from("application_packages")
    .select("id")
    .eq("job_id", input.jobId)
    .maybeSingle();

  const payload = {
    user_id: userId,
    job_id: input.jobId,
    resume_document_revision_id: resume?.id ?? null,
    cover_letter_document_revision_id: letter?.id ?? null,
    resume_content_hash: resume?.content_hash ?? null,
    cover_letter_content_hash: letter?.content_hash ?? null,
    checklist,
    package_hash: packageHash,
    status: resume && letter ? "ready" : "draft",
  };

  const query = existing
    ? supabase.from("application_packages").update(payload).eq("id", existing.id)
    : supabase.from("application_packages").insert(payload);

  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as ApplicationPackage;
}

// ---------------------------------------------------------------------------
// Pure selectors used by the UI (and tests)
// ---------------------------------------------------------------------------

export interface JobMaterialsStatus {
  job: JobRef;
  resume: RevisionWithJob | null;
  coverLetter: RevisionWithJob | null;
  resumeApproved: boolean;
  coverLetterApproved: boolean;
  packageReady: boolean;
  label: string;
}

export function jobMaterialsStatus(workspace: DocumentWorkspace): JobMaterialsStatus[] {
  const latest = (list: RevisionWithJob[], jobId: string) =>
    list
      .filter((r) => r.job_id === jobId)
      .sort((a, b) => b.revision_number - a.revision_number)[0] ?? null;

  return workspace.jobs
    .map((job) => {
      const resume = latest(workspace.tailoredResumes, job.id);
      const coverLetter = latest(workspace.coverLetters, job.id);
      const resumeApproved = resume?.approval_status === "approved";
      const coverLetterApproved = coverLetter?.approval_status === "approved";
      const packageReady = resumeApproved && coverLetterApproved;
      return {
        job,
        resume,
        coverLetter,
        resumeApproved,
        coverLetterApproved,
        packageReady,
        label: packageReady
          ? "Package ready"
          : resume || coverLetter
            ? "In review"
            : "Not started",
      };
    })
    .filter((s) => s.resume || s.coverLetter);
}

/** Revision history for a job + document type, newest first. */
export function revisionHistory(
  revisions: RevisionWithJob[],
  jobId: string | null,
  documentType: "resume" | "cover_letter"
): RevisionWithJob[] {
  return revisions
    .filter((r) => r.job_id === jobId && r.document_type === documentType)
    .sort((a, b) => b.revision_number - a.revision_number);
}

export function readContent(revision: DocumentRevision): DocumentContent {
  return toDocumentContent(revision.content, revision.label ?? "Document");
}

export function truthStatusOf(revision: DocumentRevision): TruthCheckStatus {
  return revision.truth_check_status as TruthCheckStatus;
}
