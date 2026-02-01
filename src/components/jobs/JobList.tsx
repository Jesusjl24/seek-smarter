import { useState, useEffect } from "react";
import { JobCard } from "./JobCard";
import { JobDetailModal } from "./JobDetailModal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Star, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { JobWithMatch } from "@/types/job";

interface JobListProps {
  jobs: JobWithMatch[];
  onScore: (jobId: string) => void;
  onDelete: (jobId: string) => void;
  onDeleteMultiple: (jobIds: string[]) => void;
  onShortlist: (jobId: string) => void;
  onNotAFit: (jobId: string) => void;
  onBulkShortlist: (jobIds: string[]) => void;
  onBulkNotAFit: (jobIds: string[]) => void;
  scoringJobId: string | null;
  hasResume: boolean;
  newlyScoredJobId?: string | null;
  onScoredJobViewed?: () => void;
}

export function JobList({
  jobs,
  onScore,
  onDelete,
  onDeleteMultiple,
  onShortlist,
  onNotAFit,
  onBulkShortlist,
  onBulkNotAFit,
  scoringJobId,
  hasResume,
  newlyScoredJobId,
  onScoredJobViewed,
}: JobListProps) {
  const [selectedJob, setSelectedJob] = useState<JobWithMatch | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Auto-open modal when a job is newly scored
  useEffect(() => {
    if (newlyScoredJobId) {
      const scoredJob = jobs.find((j) => j.id === newlyScoredJobId);
      if (scoredJob) {
        setSelectedJob(scoredJob);
      }
    }
  }, [newlyScoredJobId, jobs]);

  // Clear selection when jobs change
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(jobs.map((j) => j.id));
      const filtered = new Set([...prev].filter((id) => validIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }, [jobs]);

  const handleCloseModal = () => {
    setSelectedJob(null);
    if (newlyScoredJobId) {
      onScoredJobViewed?.();
    }
  };

  const handleSelectChange = (jobId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(jobId);
      } else {
        next.delete(jobId);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(jobs.map((j) => j.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleBulkShortlist = () => {
    onBulkShortlist([...selectedIds]);
    setSelectedIds(new Set());
  };

  const handleBulkNotAFit = () => {
    onBulkNotAFit([...selectedIds]);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = () => {
    onDeleteMultiple([...selectedIds]);
    setSelectedIds(new Set());
  };

  const handleDeleteAll = () => {
    onDeleteMultiple(jobs.map((j) => j.id));
    setSelectedIds(new Set());
  };

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No jobs in inbox</p>
        <p className="text-sm mt-1">Search for jobs to get started</p>
      </div>
    );
  }

  const allSelected = jobs.length > 0 && selectedIds.size === jobs.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < jobs.length;

  return (
    <>
      <div className="flex items-center justify-between mb-4 pb-4 border-b flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            ref={(el) => {
              if (el) {
                (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate = someSelected;
              }
            }}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : `${jobs.length} jobs`}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleBulkShortlist}>
                <Star className="h-4 w-4 mr-2" />
                Shortlist ({selectedIds.size})
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkNotAFit}>
                <XCircle className="h-4 w-4 mr-2" />
                Not a Fit ({selectedIds.size})
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete ({selectedIds.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete selected jobs?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {selectedIds.size} job{selectedIds.size > 1 ? 's' : ''}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all jobs?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all {jobs.length} jobs from inbox.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onScore={onScore}
            onDelete={onDelete}
            onViewDetails={setSelectedJob}
            onShortlist={onShortlist}
            onNotAFit={onNotAFit}
            isScoring={scoringJobId === job.id}
            hasResume={hasResume}
            isSelected={selectedIds.has(job.id)}
            onSelectChange={handleSelectChange}
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
