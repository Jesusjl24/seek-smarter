import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowRight, Download, Sparkles } from "lucide-react";
import { SearchSourceBar } from "@/components/search/SearchSourceBar";
import { SearchProgress } from "@/components/search/SearchProgress";
import { RecommendationCard } from "@/components/jobs/RecommendationCard";
import { ReviewQueue } from "@/components/jobs/ReviewQueue";
import { PolicyBar } from "@/components/policy/PolicyBar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api/client";
import { isGuest, guestScoreJob } from "@/lib/guest";
import { fetchPreferences } from "@/lib/api/preferences";
import { classifyScore } from "@/lib/policy";
import { EMPTY_PREFERENCES, type CandidatePreferences } from "@/types/preferences";
import {
  fetchJobsByStatus,
  fetchArtifactsForJobs,
  upsertJobs,
  deleteJob,
  deleteJobs,
  saveJobMatch,
  updateJobStatus,
  bulkUpdateJobStatus,
} from "@/lib/api/jobs";
import { useLayoutContext } from "@/components/layout/MainLayout";
import type { JobWithMatch, SearchFilters, PipelineStatus } from "@/types/job";


const defaultFilters: SearchFilters = {
  keywords: "",
  location: "",
  workType: "",
  workArrangement: "",
  salaryMin: "",
  salaryMax: "",
  salaryType: "annual",
  datePosted: "",
  jobLimit: "20",
};

const Inbox = () => {
  const [jobs, setJobs] = useState<JobWithMatch[]>([]);
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [isSearching, setIsSearching] = useState(false);
  const [isScoringAll, setIsScoringAll] = useState(false);
  const [scoringJobId, setScoringJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newlyScoredJobId, setNewlyScoredJobId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [artifactKinds, setArtifactKinds] = useState<Record<string, Set<string>>>({});
  const { toast } = useToast();
  const { profile, refreshCounts } = useLayoutContext();
  const [prefs, setPrefs] = useState<CandidatePreferences>(EMPTY_PREFERENCES);

  const policy = useMemo(
    () => ({ policy_strong: prefs.policy_strong, policy_review: prefs.policy_review }),
    [prefs.policy_strong, prefs.policy_review]
  );

  // Career profile drives dealbreakers and the score policy shown on cards.
  useEffect(() => {
    fetchPreferences()
      .then(setPrefs)
      .catch((e) => console.error("Failed to load preferences:", e));
  }, []);

  // Load inbox jobs
  useEffect(() => {
    async function loadData() {
      try {
        const jobsData = await fetchJobsByStatus("inbox");
        setJobs(jobsData);
        const artifacts = await fetchArtifactsForJobs(jobsData.map((j) => j.id));
        const map: Record<string, Set<string>> = {};
        for (const a of artifacts) {
          (map[a.job_id] ??= new Set()).add(a.artifact_type);
        }
        setArtifactKinds(map);
      } catch (error) {
        console.error("Error loading inbox:", error);
        toast({
          title: "Error loading inbox",
          description: "Failed to load jobs.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [toast]);

  // Sequential review flow works through assessed roles, best score first.
  const reviewQueue = useMemo(
    () =>
      jobs
        .filter((j) => !!j.match)
        .sort((a, b) => (b.match?.match_score ?? 0) - (a.match?.match_score ?? 0)),
    [jobs]
  );


  const handleSearch = useCallback(async () => {
    if (!filters.keywords.trim()) {
      toast({
        title: "Keywords required",
        description: "Please enter job title or keywords to search.",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    if (isGuest()) {
      await new Promise((r) => setTimeout(r, 600));
      setIsSearching(false);
      toast({
        title: "Guest demo",
        description: "Live SEEK scraping is disabled in guest mode. Sample jobs are already loaded.",
      });
      return;
    }
    try {
      const data = await apiPost<any>("/api/jobs/scrape", {
          keywords: filters.keywords,
          location: filters.location,
          limit: parseInt(filters.jobLimit) || 20,
          filters: {
            workType: filters.workType,
            workArrangement: filters.workArrangement,
            salaryMin: filters.salaryMin,
            salaryMax: filters.salaryMax,
            salaryType: filters.salaryType,
            datePosted: filters.datePosted,
          },
      });

      if (!data.jobs || data.jobs.length === 0) {
        const diagnostics = data.diagnostics;
        if (diagnostics?.possible_blocking) {
          toast({
            title: "Search blocked",
            description: "SEEK may be blocking automated searches. Please try again in a few minutes.",
            variant: "destructive",
          });
        } else if (diagnostics?.job_ids_found === 0) {
          toast({
            title: "No jobs found",
            description: "No jobs matched your search criteria. Try broadening your filters.",
          });
        } else if (data.error) {
          throw new Error(data.error);
        } else {
          toast({
            title: "No jobs found",
            description: diagnostics?.message || "Try different keywords or adjust your filters.",
          });
        }
        return;
      }

      const { newCount, existingCount } = await upsertJobs(data.jobs);

      toast({
        title: "Jobs found!",
        description: `Found ${data.jobs.length} jobs (${newCount} new, ${existingCount} already saved)`,
      });

      // Refresh job list and counts
      const updatedJobs = await fetchJobsByStatus("inbox");
      setJobs(updatedJobs);
      await refreshCounts();
    } catch (error) {
      console.error("Search error:", error);
      toast({
        title: "Search failed",
        description: error instanceof Error ? error.message : "Unable to fetch jobs from SEEK.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  }, [filters, toast, refreshCounts]);

  const handleScoreJob = useCallback(
    async (jobId: string) => {
      if (!profile) {
        toast({
          title: "Resume required",
          description: "Please upload your resume first to enable AI matching.",
          variant: "destructive",
        });
        return;
      }

      const job = jobs.find((j) => j.id === jobId);
      if (!job) return;

      setScoringJobId(jobId);
      try {
        let data: {
          match_score: number;
          skill_match_percentage: number | null;
          recommendation: string;
          reasoning: string | null;
          pros: string[];
          cons: string[];
          gaps: string[];
          strategic_advice: string | null;
          agent?: string;
          agent_version?: string;
          dealbreaker_hits?: string[];
          concerns?: string[];
        };
        if (isGuest()) {
          data = await guestScoreJob(job, prefs) as typeof data;
        } else {
          data = await apiPost(`/api/jobs/${job.id}/score`, { job, profile });
        }

        await saveJobMatch({
          job_id: jobId,
          resume_profile_id: profile.id,
          match_score: data.match_score,
          skill_match_percentage: data.skill_match_percentage,
          recommendation: data.recommendation,
          reasoning: data.reasoning,
          pros: data.pros,
          cons: data.cons,
          gaps: data.gaps,
          strategic_advice: data.strategic_advice,
          dealbreaker_hits: data.dealbreaker_hits ?? [],
          concerns: data.concerns ?? [],
          grade: data.grade,
          why_apply: data.why_apply,
        });

        // Scoring never moves a job on its own — you decide where it goes.
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  match: {
                    id: "",
                    job_id: jobId,
                    resume_profile_id: profile.id,
                    scored_at: new Date().toISOString(),
                    ...data,
                  },
                }
              : j
          )
        );
        setNewlyScoredJobId(jobId);
        toast({
          title: "Job scored",
          description: `${data.recommendation} - ${data.match_score}% match`,
        });
      } catch (error) {
        console.error("Scoring error:", error);
        toast({
          title: "Scoring failed",
          description: error instanceof Error ? error.message : "Failed to score job.",
          variant: "destructive",
        });
      } finally {
        setScoringJobId(null);
      }
    },
    [jobs, profile, toast, refreshCounts]
  );

  const handleScoreAll = useCallback(async () => {
    if (!profile) {
      toast({
        title: "Resume required",
        description: "Please upload your resume first.",
        variant: "destructive",
      });
      return;
    }

    const unscoredJobs = jobs.filter((j) => !j.match);
    if (unscoredJobs.length === 0) {
      toast({
        title: "All jobs scored",
        description: "All jobs have already been scored.",
      });
      return;
    }

    setIsScoringAll(true);
    let scored = 0;
    let failed = 0;

    for (const job of unscoredJobs) {
      try {
        setScoringJobId(job.id);
        let data: {
          match_score: number;
          skill_match_percentage: number | null;
          recommendation: string;
          reasoning: string | null;
          pros: string[];
          cons: string[];
          gaps: string[];
          strategic_advice: string | null;
          agent?: string;
          agent_version?: string;
          dealbreaker_hits?: string[];
          concerns?: string[];
        };
        if (isGuest()) {
          data = await guestScoreJob(job, prefs) as typeof data;
        } else {
          try { data = await apiPost(`/api/jobs/${job.id}/score`, { job, profile }); }
          catch { failed++; continue; }
        }

        await saveJobMatch({
          job_id: job.id,
          resume_profile_id: profile.id,
          match_score: data.match_score,
          skill_match_percentage: data.skill_match_percentage,
          recommendation: data.recommendation,
          reasoning: data.reasoning,
          pros: data.pros,
          cons: data.cons,
          gaps: data.gaps,
          strategic_advice: data.strategic_advice,
          dealbreaker_hits: data.dealbreaker_hits ?? [],
          concerns: data.concerns ?? [],
          grade: data.grade,
          why_apply: data.why_apply,
        });

        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? {
                  ...j,
                  match: {
                    id: "",
                    job_id: job.id,
                    resume_profile_id: profile.id,
                    scored_at: new Date().toISOString(),
                    ...data,
                  },
                }
              : j
          )
        );

        scored++;
        await new Promise((r) => setTimeout(r, 1000));
      } catch (error) {
        console.error(`Failed to score job ${job.id}:`, error);
        failed++;
      }
    }

    setScoringJobId(null);
    setIsScoringAll(false);

    toast({
      title: "Batch scoring complete",
      description: `Scored ${scored} job${scored === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}. Nothing was moved automatically.`,
    });
  }, [jobs, profile, prefs, toast, refreshCounts]);

  const handleDeleteJob = useCallback(
    async (jobId: string) => {
      try {
        await deleteJob(jobId);
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        await refreshCounts();
        toast({ title: "Job deleted" });
      } catch (error) {
        toast({ title: "Delete failed", variant: "destructive" });
      }
    },
    [toast, refreshCounts]
  );

  const handleDeleteMultiple = useCallback(
    async (jobIds: string[]) => {
      try {
        await deleteJobs(jobIds);
        setJobs((prev) => prev.filter((j) => !jobIds.includes(j.id)));
        await refreshCounts();
        toast({ title: `${jobIds.length} jobs deleted` });
      } catch (error) {
        toast({ title: "Delete failed", variant: "destructive" });
      }
    },
    [toast, refreshCounts]
  );

  const handleMoveToStatus = useCallback(
    async (jobId: string, status: PipelineStatus) => {
      try {
        await updateJobStatus(jobId, status);
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        await refreshCounts();
        toast({ title: `Moved to ${status.replace("_", " ")}` });
      } catch (error) {
        toast({ title: "Move failed", variant: "destructive" });
      }
    },
    [toast, refreshCounts]
  );

  const handleBulkMoveToStatus = useCallback(
    async (jobIds: string[], status: PipelineStatus) => {
      try {
        await bulkUpdateJobStatus(jobIds, status);
        setJobs((prev) => prev.filter((j) => !jobIds.includes(j.id)));
        await refreshCounts();
        toast({ title: `${jobIds.length} jobs moved to ${status.replace("_", " ")}` });
      } catch (error) {
        toast({ title: "Move failed", variant: "destructive" });
      }
    },
    [toast, refreshCounts]
  );

  const handleExport = useCallback(() => {
    if (jobs.length === 0) return;

    const headers = [
      "Title", "Company", "Location", "Salary", "Work Type", "Work Arrangement",
      "Match Score", "Recommendation", "URL", "Date Posted", "Date Scraped",
    ];

    const rows = jobs.map((job) => [
      job.title, job.company, job.location, job.salary_range || "",
      job.work_type || "", job.work_arrangement || "",
      job.match?.match_score?.toString() || "", job.match?.recommendation || "",
      job.job_url, job.date_posted || "", job.date_scraped,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-inbox-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export complete", description: `Exported ${jobs.length} jobs to CSV.` });
  }, [jobs, toast]);

  const unscoredCount = jobs.filter((j) => !j.match).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading inbox...</p>
        </div>
      </div>
    );
  }

  const strongCount = jobs.filter(
    (j) => j.match && classifyScore(j.match.match_score, policy) === "strong_apply"
  ).length;
  const reviewCount = jobs.filter(
    (j) => j.match && classifyScore(j.match.match_score, policy) === "review"
  ).length;

  return (
    <>
      <SearchProgress isSearching={isSearching} jobLimit={parseInt(filters.jobLimit) || 20} />
      <div className="space-y-5" data-testid="inbox-page">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Job Inbox</h1>
            <p className="text-sm text-muted-foreground">
              {jobs.length} role{jobs.length === 1 ? "" : "s"} waiting · {unscoredCount} not
              assessed · {strongCount} Strong Apply · {reviewCount} Review
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={reviewQueue.length === 0}
              onClick={() => setReviewId(reviewQueue[0]?.id ?? null)}
              data-testid="inbox-review-next"
            >
              Review next
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="assistant"
              onClick={handleScoreAll}
              disabled={isScoringAll || unscoredCount === 0 || !profile}
            >
              <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
              {isScoringAll ? "Assessing…" : `Assess ${unscoredCount || ""}`.trim()}
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={jobs.length === 0}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Export
            </Button>
          </div>
        </header>

        <PolicyBar policy={policy} compact />

        <SearchSourceBar
          filters={filters}
          onFiltersChange={setFilters}
          onSearch={handleSearch}
          isSearching={isSearching}
        />

        {jobs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-sm font-medium">Your inbox is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Run a search above to bring roles in.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <RecommendationCard
                key={job.id}
                job={job}
                policy={policy}
                hasResume={!!profile}
                isScoring={scoringJobId === job.id}
                hasTailoredResume={artifactKinds[job.id]?.has("tailored_resume") ?? false}
                hasCoverLetter={artifactKinds[job.id]?.has("cover_letter") ?? false}
                onReview={() => setReviewId(job.id)}
                onScore={() => handleScoreJob(job.id)}
                onShortlist={() => handleMoveToStatus(job.id, "shortlist")}
                onNotAFit={() => handleMoveToStatus(job.id, "not_fit")}
                onDelete={() => handleDeleteJob(job.id)}
              />
            ))}
          </div>
        )}

        <ReviewQueue
          queue={reviewQueue}
          startId={reviewId}
          policy={policy}
          onClose={() => setReviewId(null)}
          onShortlist={(id) => handleMoveToStatus(id, "shortlist")}
          onNotAFit={(id) => handleMoveToStatus(id, "not_fit")}
        />
      </div>
    </>
  );
};


export default Inbox;
