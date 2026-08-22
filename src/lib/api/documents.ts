// Document library: master resume + tailored resume versions + cover letters.

import { fetchJobs, fetchArtifactsForJobs } from "@/lib/api/jobs";
import { fetchResumeProfile } from "@/lib/api/resume";
import type {
  CoverLetter,
  JobArtifact,
  JobWithMatch,
  ResumeProfile,
  TailoredResume,
} from "@/types/job";

export interface DocumentItem {
  id: string;
  kind: "tailored_resume" | "cover_letter";
  job_id: string;
  job_title: string;
  company: string;
  created_at: string;
  score: number | null;
  content: TailoredResume | CoverLetter | Record<string, unknown>;
}

export interface DocumentLibrary {
  master: ResumeProfile | null;
  tailored: DocumentItem[];
  coverLetters: DocumentItem[];
}

export function buildDocumentLibrary(
  jobs: JobWithMatch[],
  artifacts: JobArtifact[],
  master: ResumeProfile | null
): DocumentLibrary {
  const byJob = new Map(jobs.map((j) => [j.id, j]));
  const items: DocumentItem[] = artifacts
    .filter(
      (a) => a.artifact_type === "tailored_resume" || a.artifact_type === "cover_letter"
    )
    .map((a) => {
      const job = byJob.get(a.job_id);
      return {
        id: a.id,
        kind: a.artifact_type as DocumentItem["kind"],
        job_id: a.job_id,
        job_title: job?.title ?? "Unknown role",
        company: job?.company ?? "Unknown company",
        created_at: a.created_at,
        score: job?.match?.match_score ?? null,
        content: a.content,
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    master,
    tailored: items.filter((i) => i.kind === "tailored_resume"),
    coverLetters: items.filter((i) => i.kind === "cover_letter"),
  };
}

export async function fetchDocumentLibrary(): Promise<DocumentLibrary> {
  const [jobs, master] = await Promise.all([fetchJobs(), fetchResumeProfile()]);
  const artifacts = await fetchArtifactsForJobs(jobs.map((j) => j.id));
  return buildDocumentLibrary(jobs, artifacts, master);
}
