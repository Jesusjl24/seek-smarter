// Builds the Today / Assistant Activity snapshot out of data the app already has.
// Pure derivation — no new backend, no invented metrics.

import { fetchJobs, fetchArtifactsForJobs } from "@/lib/api/jobs";
import { fetchResumeProfile } from "@/lib/api/resume";
import { fetchPreferences } from "@/lib/api/preferences";
import { supabase } from "@/integrations/supabase/client";
import { classifyScore, BAND_LABELS } from "@/lib/policy";
import type { ScorePolicy } from "@/types/preferences";
import type { JobArtifact, JobWithMatch } from "@/types/job";
import type {
  AssistantDocument,
  AssistantFailure,
  AssistantPackage,
  AssistantQuestion,
  AssistantSnapshot,
} from "@/types/assistant";

/** A job belongs to the "latest run" when it was scraped in the same 24h window as the newest job. */
export function latestRunJobs(jobs: JobWithMatch[]): {
  runJobs: JobWithMatch[];
  lastRunAt: string | null;
} {
  const withDates = jobs.filter((j) => !!j.date_scraped);
  if (withDates.length === 0) return { runJobs: [], lastRunAt: null };
  const sorted = [...withDates].sort(
    (a, b) => new Date(b.date_scraped).getTime() - new Date(a.date_scraped).getTime()
  );
  const newest = new Date(sorted[0].date_scraped).getTime();
  const windowMs = 24 * 60 * 60 * 1000;
  return {
    runJobs: sorted.filter((j) => newest - new Date(j.date_scraped).getTime() <= windowMs),
    lastRunAt: sorted[0].date_scraped,
  };
}

export function buildAssistantSnapshot(params: {
  jobs: JobWithMatch[];
  artifacts: JobArtifact[];
  documentRevisions?: Array<{ job_id: string | null; document_type: string; approval_status: string }>;
  policy: ScorePolicy;
  hasResume: boolean;
}): AssistantSnapshot {
  const { jobs, artifacts, documentRevisions = [], policy, hasResume } = params;
  const { runJobs, lastRunAt } = latestRunJobs(jobs);
  const byJob = new Map<string, JobWithMatch>(jobs.map((j) => [j.id, j]));

  const assessed = runJobs.filter((j) => !!j.match);
  let strong = 0;
  let review = 0;
  let deprioritise = 0;
  const questions: AssistantQuestion[] = [];
  const incoming: AssistantSnapshot["incoming"] = [];
  const draftKinds = new Map<string, Set<string>>();
  for (const artifact of artifacts) {
    const set = draftKinds.get(artifact.job_id) ?? new Set<string>();
    set.add(artifact.artifact_type);
    draftKinds.set(artifact.job_id, set);
  }
  for (const revision of documentRevisions) {
    if (!revision.job_id || !["pending", "approved"].includes(revision.approval_status)) continue;
    const set = draftKinds.get(revision.job_id) ?? new Set<string>();
    set.add(revision.document_type === "resume" ? "tailored_resume" : "cover_letter");
    draftKinds.set(revision.job_id, set);
  }

  for (const job of assessed) {
    const score = job.match!.match_score;
    const band = classifyScore(score, policy);
    if (band === "strong_apply") strong++;
    else if (band === "review") review++;
    else deprioritise++;

    // Anything scored but still sitting in the inbox is a decision the user owes.
    if (job.pipeline_status === "inbox" && band !== "deprioritise") {
      questions.push({
        job_id: job.id,
        title: job.title,
        company: job.company,
        score,
        band_label: BAND_LABELS[band],
        question:
          band === "strong_apply"
            ? "Shortlist this role or rule it out?"
            : "Worth a closer read — shortlist or not a fit?",
      });
    }
    if ((job.pipeline_status === "inbox" || job.pipeline_status === "shortlist") && job.match?.grade) {
      const drafts = draftKinds.get(job.id);
      incoming.push({ job_id: job.id, title: job.title, company: job.company, score, grade: job.match.grade, why_apply: job.match.why_apply || job.match.strategic_advice || job.match.reasoning || "", risks: job.match.risks || (job.match.cons ?? []).join("; "), band_label: BAND_LABELS[band], has_resume_draft: drafts?.has("tailored_resume") ?? false, has_cover_letter_draft: drafts?.has("cover_letter") ?? false });
    }
  }

  const documents_ready: AssistantDocument[] = [];
  const kinds = new Map<string, Set<string>>();
  const readyAt = new Map<string, string>();

  for (const a of artifacts) {
    if (a.artifact_type !== "tailored_resume" && a.artifact_type !== "cover_letter") continue;
    const job = byJob.get(a.job_id);
    if (!job) continue;
    documents_ready.push({
      job_id: a.job_id,
      title: job.title,
      company: job.company,
      kind: a.artifact_type,
      created_at: a.created_at,
    });
    const set = kinds.get(a.job_id) ?? new Set<string>();
    set.add(a.artifact_type);
    kinds.set(a.job_id, set);
    const prev = readyAt.get(a.job_id);
    if (!prev || new Date(a.created_at) > new Date(prev)) readyAt.set(a.job_id, a.created_at);
  }
  documents_ready.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const packages_ready: AssistantPackage[] = [];
  for (const [jobId, set] of kinds) {
    if (!set.has("tailored_resume") || !set.has("cover_letter")) continue;
    const job = byJob.get(jobId);
    if (!job) continue;
    const score = job.match?.match_score ?? 0;
    packages_ready.push({
      job_id: jobId,
      title: job.title,
      company: job.company,
      score,
      band_label: BAND_LABELS[classifyScore(score, policy)],
      ready_at: readyAt.get(jobId) ?? job.updated_at,
    });
  }

  // Retryable: assessment that should have happened but did not.
  const failures: AssistantFailure[] = hasResume
    ? runJobs
        .filter((j) => !j.match)
        .map((j) => ({
          job_id: j.id,
          title: j.title,
          company: j.company,
          reason: "Not assessed yet",
          action: "score" as const,
        }))
    : [];
  const hiddenAutoJobs = jobs.filter((job) => job.pipeline_status === "not_fit" && job.triage_source === "auto");

  return {
    assistant_connected: false,
    status: lastRunAt ? "completed" : "never_run",
    last_run_at: lastRunAt,
    jobs_found: runJobs.length,
    new_since_last_run: runJobs.length,
    jobs_new: runJobs.length,
    jobs_assessed: assessed.length,
    strong_apply: strong,
    review,
    deprioritise,
    questions,
    incoming: incoming.sort((a, b) => b.score - a.score),
    hidden_auto_count: hiddenAutoJobs.length,
    hidden_auto: hiddenAutoJobs.slice(0, 5).map((job) => ({ id: job.id, title: job.title, company: job.company, score: job.match?.match_score ?? 0, grade: job.match?.grade ?? null })),
    documents_ready,
    packages_ready,
    // Telegram is not wired up yet — report that honestly rather than faking activity.
    telegram: { connected: false, events: [] },
    failures,
    run_jobs: runJobs,
  };
}

export async function fetchAssistantSnapshot(): Promise<AssistantSnapshot> {
  const [jobs, profile, prefs] = await Promise.all([
    fetchJobs(),
    fetchResumeProfile(),
    fetchPreferences(),
  ]);
  const artifacts = await fetchArtifactsForJobs(jobs.map((j) => j.id));
  const { data: documentRevisions, error } = jobs.length ? await supabase.from("document_revisions").select("job_id,document_type,approval_status").in("job_id", jobs.map((job) => job.id)).in("approval_status", ["pending", "approved"]) : { data: [], error: null };
  if (error) throw error;
  return buildAssistantSnapshot({
    jobs,
    artifacts,
    documentRevisions: documentRevisions ?? [],
    policy: { policy_strong: prefs.policy_strong, policy_review: prefs.policy_review },
    hasResume: !!profile,
  });
}
