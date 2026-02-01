import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { JobsTable } from "@/components/jobs/JobsTable";
import { TailoredResumeModal } from "@/components/jobs/TailoredResumeModal";
import { CoverLetterModal } from "@/components/jobs/CoverLetterModal";
import {
  fetchJobsByStatus,
  deleteJob,
  deleteJobs,
  updateJobStatus,
  bulkUpdateJobStatus,
  updateJobNotes,
  fetchJobArtifacts,
  saveJobArtifact,
  generateTailoredResume,
  generateCoverLetter,
} from "@/lib/api/jobs";
import { fetchResumeProfile } from "@/lib/api/resume";
import { useLayoutContext } from "@/components/layout/MainLayout";
import type { JobWithMatch, PipelineStatus, TailoredResume, CoverLetter, JobArtifact, ResumeProfile } from "@/types/job";

const Shortlist = () => {
  const [jobs, setJobs] = useState<JobWithMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [artifacts, setArtifacts] = useState<Map<string, JobArtifact[]>>(new Map());
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  
  // Modal states
  const [viewingResume, setViewingResume] = useState<TailoredResume | null>(null);
  const [viewingCoverLetter, setViewingCoverLetter] = useState<CoverLetter | null>(null);
  
  const { toast } = useToast();
  const { refreshCounts } = useLayoutContext();

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch shortlist plus applied/interview/offer stages
        const [jobsData, profileData] = await Promise.all([
          fetchJobsByStatus([
            "shortlist",
            "applied",
            "screening",
            "interview",
            "final_interview",
            "offer",
          ]),
          fetchResumeProfile(),
        ]);
        
        setJobs(jobsData);
        setProfile(profileData);
        
        // Fetch artifacts for all jobs
        const artifactsMap = new Map<string, JobArtifact[]>();
        await Promise.all(
          jobsData.map(async (job) => {
            try {
              const jobArtifacts = await fetchJobArtifacts(job.id);
              if (jobArtifacts.length > 0) {
                artifactsMap.set(job.id, jobArtifacts);
              }
            } catch {
              // Ignore individual artifact fetch errors
            }
          })
        );
        setArtifacts(artifactsMap);
      } catch (error) {
        console.error("Error loading shortlist:", error);
        toast({
          title: "Error loading shortlist",
          description: "Failed to load jobs.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [toast]);

  const handleStatusChange = useCallback(
    async (jobId: string, status: PipelineStatus) => {
      try {
        await updateJobStatus(jobId, status);
        // If moved out of shortlist pipeline, remove from view
        if (status === "inbox" || status === "not_fit" || status === "rejected" || status === "withdrawn") {
          setJobs((prev) => prev.filter((j) => j.id !== jobId));
        } else {
          setJobs((prev) =>
            prev.map((j) => (j.id === jobId ? { ...j, pipeline_status: status } : j))
          );
        }
        await refreshCounts();
        toast({ title: `Status updated to ${status.replace("_", " ")}` });
      } catch (error) {
        toast({ title: "Update failed", variant: "destructive" });
      }
    },
    [toast, refreshCounts]
  );

  const handleBulkStatusChange = useCallback(
    async (jobIds: string[], status: PipelineStatus) => {
      try {
        await bulkUpdateJobStatus(jobIds, status);
        if (status === "inbox" || status === "not_fit" || status === "rejected" || status === "withdrawn") {
          setJobs((prev) => prev.filter((j) => !jobIds.includes(j.id)));
        } else {
          setJobs((prev) =>
            prev.map((j) => (jobIds.includes(j.id) ? { ...j, pipeline_status: status } : j))
          );
        }
        await refreshCounts();
        toast({ title: `${jobIds.length} jobs updated` });
      } catch (error) {
        toast({ title: "Update failed", variant: "destructive" });
      }
    },
    [toast, refreshCounts]
  );

  const handleNotesChange = useCallback(
    async (jobId: string, notes: string) => {
      try {
        await updateJobNotes(jobId, notes);
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, notes } : j))
        );
        toast({ title: "Notes saved" });
      } catch (error) {
        toast({ title: "Failed to save notes", variant: "destructive" });
      }
    },
    [toast]
  );

  const handleDelete = useCallback(
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

  const handleGenerateResume = useCallback(
    async (job: JobWithMatch): Promise<TailoredResume> => {
      if (!profile) {
        throw new Error("Please upload your resume first");
      }
      if (!job.match || job.match.match_score < 60) {
        throw new Error("Score must be 60 or higher");
      }

      try {
        const result = await generateTailoredResume(job, profile, job.match.match_score);
        
        // Save artifact
        await saveJobArtifact({
          job_id: job.id,
          artifact_type: 'tailored_resume',
          content: result,
          agent: result.agent_meta.agent,
          version: result.agent_meta.version,
        });

        // Update local artifacts map
        setArtifacts((prev) => {
          const next = new Map(prev);
          const existing = next.get(job.id) || [];
          next.set(job.id, [
            ...existing.filter(a => a.artifact_type !== 'tailored_resume'),
            {
              id: crypto.randomUUID(),
              job_id: job.id,
              artifact_type: 'tailored_resume',
              content: result,
              agent: result.agent_meta.agent,
              version: result.agent_meta.version,
              created_at: new Date().toISOString(),
            },
          ]);
          return next;
        });

        toast({ title: "Resume tailored successfully" });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate";
        toast({ title: message, variant: "destructive" });
        throw error;
      }
    },
    [profile, toast]
  );

  const handleGenerateCoverLetter = useCallback(
    async (job: JobWithMatch): Promise<CoverLetter> => {
      if (!profile) {
        throw new Error("Please upload your resume first");
      }
      if (!job.match || job.match.match_score < 60) {
        throw new Error("Score must be 60 or higher");
      }

      try {
        // Check if we have tailored resume highlights to use
        const resumeArtifact = artifacts.get(job.id)?.find(a => a.artifact_type === 'tailored_resume');
        const highlights = resumeArtifact 
          ? (resumeArtifact.content as TailoredResume).skills_to_emphasize 
          : undefined;

        const result = await generateCoverLetter(job, profile, job.match.match_score, highlights);
        
        // Save artifact
        await saveJobArtifact({
          job_id: job.id,
          artifact_type: 'cover_letter',
          content: result,
          agent: result.agent_meta.agent,
          version: result.agent_meta.version,
        });

        // Update local artifacts map
        setArtifacts((prev) => {
          const next = new Map(prev);
          const existing = next.get(job.id) || [];
          next.set(job.id, [
            ...existing.filter(a => a.artifact_type !== 'cover_letter'),
            {
              id: crypto.randomUUID(),
              job_id: job.id,
              artifact_type: 'cover_letter',
              content: result,
              agent: result.agent_meta.agent,
              version: result.agent_meta.version,
              created_at: new Date().toISOString(),
            },
          ]);
          return next;
        });

        toast({ title: "Cover letter generated successfully" });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate";
        toast({ title: message, variant: "destructive" });
        throw error;
      }
    },
    [profile, artifacts, toast]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading shortlist...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Shortlist</h1>
        <p className="text-muted-foreground">
          Jobs you're interested in. Track your application progress here.
          {!profile && (
            <span className="text-yellow-600 ml-2">
              Upload your resume to enable AI tailoring.
            </span>
          )}
        </p>
      </div>

      <JobsTable
        jobs={jobs}
        onStatusChange={handleStatusChange}
        onBulkStatusChange={handleBulkStatusChange}
        onNotesChange={handleNotesChange}
        onDelete={handleDelete}
        onDeleteMultiple={handleDeleteMultiple}
        showStageColumn={true}
        showAIColumn={!!profile}
        availableActions={{
          moveToInbox: true,
          moveToNotAFit: true,
        }}
        artifacts={artifacts}
        onGenerateResume={handleGenerateResume}
        onGenerateCoverLetter={handleGenerateCoverLetter}
        onViewResume={setViewingResume}
        onViewCoverLetter={setViewingCoverLetter}
      />

      <TailoredResumeModal
        resume={viewingResume}
        open={!!viewingResume}
        onClose={() => setViewingResume(null)}
      />

      <CoverLetterModal
        coverLetter={viewingCoverLetter}
        open={!!viewingCoverLetter}
        onClose={() => setViewingCoverLetter(null)}
      />
    </div>
  );
};

export default Shortlist;
