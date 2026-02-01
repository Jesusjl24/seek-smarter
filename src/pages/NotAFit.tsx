import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { JobsTable } from "@/components/jobs/JobsTable";
import {
  fetchJobsByStatus,
  deleteJob,
  deleteJobs,
  updateJobStatus,
  bulkUpdateJobStatus,
  updateJobNotes,
} from "@/lib/api/jobs";
import { useLayoutContext } from "@/components/layout/MainLayout";
import type { JobWithMatch, PipelineStatus } from "@/types/job";

const NotAFit = () => {
  const [jobs, setJobs] = useState<JobWithMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { refreshCounts } = useLayoutContext();

  useEffect(() => {
    async function loadData() {
      try {
        const jobsData = await fetchJobsByStatus(["not_fit", "rejected", "withdrawn"]);
        setJobs(jobsData);
      } catch (error) {
        console.error("Error loading not a fit:", error);
        toast({
          title: "Error loading jobs",
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
        // Remove from view if moved elsewhere
        if (status !== "not_fit" && status !== "rejected" && status !== "withdrawn") {
          setJobs((prev) => prev.filter((j) => j.id !== jobId));
        } else {
          setJobs((prev) =>
            prev.map((j) => (j.id === jobId ? { ...j, pipeline_status: status } : j))
          );
        }
        await refreshCounts();
        toast({ title: `Moved to ${status.replace("_", " ")}` });
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
        if (status !== "not_fit" && status !== "rejected" && status !== "withdrawn") {
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Not a Fit</h1>
        <p className="text-muted-foreground">
          Jobs that didn't match or were rejected. You can restore them if you change your mind.
        </p>
      </div>

      <JobsTable
        jobs={jobs}
        onStatusChange={handleStatusChange}
        onBulkStatusChange={handleBulkStatusChange}
        onNotesChange={handleNotesChange}
        onDelete={handleDelete}
        onDeleteMultiple={handleDeleteMultiple}
        showStageColumn={false}
        availableActions={{
          moveToInbox: true,
          moveToShortlist: true,
        }}
      />
    </div>
  );
};

export default NotAFit;
