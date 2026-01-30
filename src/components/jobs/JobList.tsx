import { useState, useEffect } from "react";
import { JobCard } from "./JobCard";
import { JobDetailModal } from "./JobDetailModal";
import type { JobWithMatch } from "@/types/job";

interface JobListProps {
  jobs: JobWithMatch[];
  onScore: (jobId: string) => void;
  onDelete: (jobId: string) => void;
  scoringJobId: string | null;
  hasResume: boolean;
  newlyScoredJobId?: string | null;
  onScoredJobViewed?: () => void;
}

export function JobList({
  jobs,
  onScore,
  onDelete,
  scoringJobId,
  hasResume,
  newlyScoredJobId,
  onScoredJobViewed,
}: JobListProps) {
  const [selectedJob, setSelectedJob] = useState<JobWithMatch | null>(null);

  // Auto-open modal when a job is newly scored
  useEffect(() => {
    if (newlyScoredJobId) {
      const scoredJob = jobs.find((j) => j.id === newlyScoredJobId);
      if (scoredJob) {
        setSelectedJob(scoredJob);
      }
    }
  }, [newlyScoredJobId, jobs]);

  const handleCloseModal = () => {
    setSelectedJob(null);
    if (newlyScoredJobId) {
      onScoredJobViewed?.();
    }
  };

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No jobs found</p>
        <p className="text-sm mt-1">Search for jobs to get started</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onScore={onScore}
            onDelete={onDelete}
            onViewDetails={setSelectedJob}
            isScoring={scoringJobId === job.id}
            hasResume={hasResume}
          />
        ))}
      </div>
      <JobDetailModal
        job={selectedJob}
        open={!!selectedJob}
        onClose={handleCloseModal}
      />
    </>
  );
}
