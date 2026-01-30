import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchFiltersPanel } from "@/components/search/SearchFilters";
import { JobList } from "@/components/jobs/JobList";
import { JobStats } from "@/components/sidebar/JobStats";
import { ActionButtons } from "@/components/sidebar/ActionButtons";
import { ResumeUpload } from "@/components/resume/ResumeUpload";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchJobs, upsertJobs, deleteJob, saveJobMatch } from "@/lib/api/jobs";
import { fetchResumeProfile } from "@/lib/api/resume";
import type { JobWithMatch, ResumeProfile, SearchFilters } from "@/types/job";

const defaultFilters: SearchFilters = {
  keywords: "",
  location: "",
  workTypes: [],
  workArrangements: [],
  minSalary: "",
  datePosted: "",
};

const Index = () => {
  const [jobs, setJobs] = useState<JobWithMatch[]>([]);
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [isSearching, setIsSearching] = useState(false);
  const [isScoringAll, setIsScoringAll] = useState(false);
  const [scoringJobId, setScoringJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [jobsData, profileData] = await Promise.all([
          fetchJobs(),
          fetchResumeProfile(),
        ]);
        setJobs(jobsData);
        setProfile(profileData);
      } catch (error) {
        console.error("Error loading data:", error);
        toast({
          title: "Error loading data",
          description: "Failed to load saved jobs and profile.",
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
          filters: {
            workTypes: filters.workTypes,
            workArrangements: filters.workArrangements,
            minSalary: filters.minSalary,
            datePosted: filters.datePosted,
          },
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || "Scraping failed");
      }

      if (data.jobs.length === 0) {
        toast({
          title: "No jobs found",
          description: "Try different keywords or adjust your filters.",
        });
        return;
      }

      // Upsert jobs to database
      const { newCount, existingCount } = await upsertJobs(data.jobs);

      toast({
        title: "Jobs found!",
        description: `Found ${data.jobs.length} jobs (${newCount} new, ${existingCount} already saved)`,
      });

      // Refresh job list
      const updatedJobs = await fetchJobs();
      setJobs(updatedJobs);
    } catch (error) {
      console.error("Search error:", error);
      toast({
        title: "Search failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to fetch jobs from SEEK. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  }, [filters, toast]);

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

        // Save match to database
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

        // Update local state
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

        toast({
          title: "Job scored",
          description: `${data.recommendation} - ${data.match_score}% match`,
        });
      } catch (error) {
        console.error("Scoring error:", error);
        toast({
          title: "Scoring failed",
          description:
            error instanceof Error ? error.message : "Failed to score job.",
          variant: "destructive",
        });
      } finally {
        setScoringJobId(null);
      }
    },
    [jobs, profile, toast]
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

        // Small delay to avoid rate limiting
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
      description: `Scored ${scored} jobs${failed > 0 ? `, ${failed} failed` : ""}`,
    });
  }, [jobs, profile, toast]);

  const handleDeleteJob = useCallback(
    async (jobId: string) => {
      try {
        await deleteJob(jobId);
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        toast({
          title: "Job deleted",
          description: "Job has been removed from your list.",
        });
      } catch (error) {
        console.error("Delete error:", error);
        toast({
          title: "Delete failed",
          description: "Failed to delete job.",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const handleExport = useCallback(() => {
    if (jobs.length === 0) return;

    const headers = [
      "Title",
      "Company",
      "Location",
      "Salary",
      "Work Type",
      "Work Arrangement",
      "Match Score",
      "Recommendation",
      "URL",
      "Date Posted",
      "Date Scraped",
    ];

    const rows = jobs.map((job) => [
      job.title,
      job.company,
      job.location,
      job.salary_range || "",
      job.work_type || "",
      job.work_arrangement || "",
      job.match?.match_score?.toString() || "",
      job.match?.recommendation || "",
      job.job_url,
      job.date_posted || "",
      job.date_scraped,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-search-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export complete",
      description: `Exported ${jobs.length} jobs to CSV.`,
    });
  }, [jobs, toast]);

  // Calculate stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const recentJobs = jobs.filter(
    (j) => new Date(j.date_scraped) >= todayStart
  ).length;
  const scoredJobs = jobs.filter((j) => j.match).length;
  const unscoredCount = jobs.filter((j) => !j.match).length;

  const sidebar = (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold mb-1">JS-Searcher</h1>
        <p className="text-sm text-muted-foreground">
          AI-powered SEEK job matcher
        </p>
      </div>

      <Separator />

      <ResumeUpload profile={profile} onProfileUpdate={setProfile} />

      <Separator />

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
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AppLayout sidebar={sidebar}>
      <div className="space-y-6">
        <SearchBar
          keywords={filters.keywords}
          location={filters.location}
          onKeywordsChange={(keywords) =>
            setFilters((f) => ({ ...f, keywords }))
          }
          onLocationChange={(location) =>
            setFilters((f) => ({ ...f, location }))
          }
          onSearch={handleSearch}
          isLoading={isSearching}
        />

        <JobStats
          totalJobs={jobs.length}
          scoredJobs={scoredJobs}
          recentJobs={recentJobs}
        />

        <JobList
          jobs={jobs}
          onScore={handleScoreJob}
          onDelete={handleDeleteJob}
          scoringJobId={scoringJobId}
          hasResume={!!profile}
        />
      </div>
    </AppLayout>
  );
};

export default Index;
