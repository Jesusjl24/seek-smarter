import { useState, useEffect, useCallback } from "react";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchFiltersPanel } from "@/components/search/SearchFilters";
import { SearchProgress } from "@/components/search/SearchProgress";
import { JobList } from "@/components/jobs/JobList";
import { ActionButtons } from "@/components/sidebar/ActionButtons";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchJobsByStatus,
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
  const { toast } = useToast();
  const { profile, refreshCounts } = useLayoutContext();

  // Load inbox jobs
  useEffect(() => {
    async function loadData() {
      try {
        const jobsData = await fetchJobsByStatus("inbox");
        setJobs(jobsData);
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
    try {
      const { data, error } = await supabase.functions.invoke("scrape-seek", {
        body: {
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
        },
      });

      if (error) throw error;

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
        const { data, error } = await supabase.functions.invoke("score-job", {
          body: { job, profile },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

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
        });

        // Auto-move to not_fit if score < 50 and still in inbox
        if (data.match_score < 50 && job.pipeline_status === "inbox") {
          await updateJobStatus(jobId, "not_fit");
          setJobs((prev) => prev.filter((j) => j.id !== jobId));
          toast({
            title: "Job scored & moved",
            description: `${data.recommendation} (${data.match_score}%) - Auto-moved to Not a Fit`,
          });
          await refreshCounts();
        } else {
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
        }
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
    let movedToNotFit = 0;

    for (const job of unscoredJobs) {
      try {
        setScoringJobId(job.id);
        const { data, error } = await supabase.functions.invoke("score-job", {
          body: { job, profile },
        });

        if (error || data.error) {
          failed++;
          continue;
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
        });

        // Auto-move low scores
        if (data.match_score < 50 && job.pipeline_status === "inbox") {
          await updateJobStatus(job.id, "not_fit");
          movedToNotFit++;
        } else {
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
        }

        scored++;
        await new Promise((r) => setTimeout(r, 1000));
      } catch (error) {
        console.error(`Failed to score job ${job.id}:`, error);
        failed++;
      }
    }

    setScoringJobId(null);
    setIsScoringAll(false);

    // Remove jobs that were moved to not_fit
    if (movedToNotFit > 0) {
      const updatedJobs = await fetchJobsByStatus("inbox");
      setJobs(updatedJobs);
      await refreshCounts();
    }

    toast({
      title: "Batch scoring complete",
      description: `Scored ${scored} jobs${movedToNotFit > 0 ? `, ${movedToNotFit} auto-moved to Not a Fit` : ""}${failed > 0 ? `, ${failed} failed` : ""}`,
    });
  }, [jobs, profile, toast, refreshCounts]);

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

  return (
    <>
      <SearchProgress isSearching={isSearching} jobLimit={parseInt(filters.jobLimit) || 20} />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Inbox</h1>
          <p className="text-muted-foreground">New jobs land here. File them into Shortlist or Not a Fit.</p>
        </div>

        <SearchBar
          keywords={filters.keywords}
          location={filters.location}
          onKeywordsChange={(keywords) => setFilters((f) => ({ ...f, keywords }))}
          onLocationChange={(location) => setFilters((f) => ({ ...f, location }))}
          onSearch={handleSearch}
          isLoading={isSearching}
        />

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-64 flex-shrink-0 space-y-4">
            <SearchFiltersPanel filters={filters} onFiltersChange={setFilters} />
            <Separator />
            <ActionButtons
              onScoreAll={handleScoreAll}
              onExport={handleExport}
              isScoring={isScoringAll}
              hasJobs={jobs.length > 0}
              hasResume={!!profile}
              unscoredCount={unscoredCount}
            />
          </div>
          <div className="flex-1">
            <JobList
              jobs={jobs}
              onScore={handleScoreJob}
              onDelete={handleDeleteJob}
              onDeleteMultiple={handleDeleteMultiple}
              onShortlist={(jobId) => handleMoveToStatus(jobId, "shortlist")}
              onNotAFit={(jobId) => handleMoveToStatus(jobId, "not_fit")}
              onBulkShortlist={(jobIds) => handleBulkMoveToStatus(jobIds, "shortlist")}
              onBulkNotAFit={(jobIds) => handleBulkMoveToStatus(jobIds, "not_fit")}
              scoringJobId={scoringJobId}
              hasResume={!!profile}
              newlyScoredJobId={newlyScoredJobId}
              onScoredJobViewed={() => setNewlyScoredJobId(null)}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Inbox;
