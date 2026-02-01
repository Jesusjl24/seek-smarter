import { useState, useMemo } from "react";
import { ExternalLink, MoreHorizontal, ArrowUpDown, Trash2, Inbox, Star, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { MatchScoreBadge } from "./MatchScoreBadge";
import { JobDetailModal } from "./JobDetailModal";
import { ArtifactGeneratorButtons } from "./ArtifactGeneratorButtons";
import type { JobWithMatch, PipelineStatus, TailoredResume, CoverLetter, JobArtifact } from "@/types/job";

interface JobsTableProps {
  jobs: JobWithMatch[];
  onStatusChange: (jobId: string, status: PipelineStatus) => void;
  onBulkStatusChange: (jobIds: string[], status: PipelineStatus) => void;
  onNotesChange: (jobId: string, notes: string) => void;
  onDelete: (jobId: string) => void;
  onDeleteMultiple: (jobIds: string[]) => void;
  showStageColumn?: boolean;
  showAIColumn?: boolean;
  availableActions: {
    moveToInbox?: boolean;
    moveToShortlist?: boolean;
    moveToNotAFit?: boolean;
  };
  // AI artifact generation
  artifacts?: Map<string, JobArtifact[]>;
  onGenerateResume?: (job: JobWithMatch) => Promise<TailoredResume>;
  onGenerateCoverLetter?: (job: JobWithMatch) => Promise<CoverLetter>;
  onViewResume?: (resume: TailoredResume) => void;
  onViewCoverLetter?: (coverLetter: CoverLetter) => void;
}

type SortKey = "title" | "company" | "match_score" | "date_posted" | "updated_at";
type SortOrder = "asc" | "desc";

const stageOptions: { value: PipelineStatus; label: string }[] = [
  { value: "shortlist", label: "Shortlist" },
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Interview" },
  { value: "final_interview", label: "Final Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export function JobsTable({
  jobs,
  onStatusChange,
  onBulkStatusChange,
  onNotesChange,
  onDelete,
  onDeleteMultiple,
  showStageColumn = true,
  showAIColumn = false,
  availableActions,
  artifacts,
  onGenerateResume,
  onGenerateCoverLetter,
  onViewResume,
  onViewCoverLetter,
}: JobsTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotesValue, setEditingNotesValue] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobWithMatch | null>(null);

  // Helper to check if job has artifact
  const getJobArtifact = (jobId: string, type: 'tailored_resume' | 'cover_letter') => {
    const jobArtifacts = artifacts?.get(jobId) || [];
    return jobArtifacts.find(a => a.artifact_type === type);
  };

  // Filter and sort jobs
  const filteredJobs = useMemo(() => {
    let filtered = jobs.filter(
      (job) =>
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.company.toLowerCase().includes(searchQuery.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aVal: string | number | null;
      let bVal: string | number | null;

      switch (sortKey) {
        case "title":
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case "company":
          aVal = a.company.toLowerCase();
          bVal = b.company.toLowerCase();
          break;
        case "match_score":
          aVal = a.match?.match_score ?? -1;
          bVal = b.match?.match_score ?? -1;
          break;
        case "date_posted":
          aVal = a.date_posted || "";
          bVal = b.date_posted || "";
          break;
        case "updated_at":
          aVal = a.updated_at || "";
          bVal = b.updated_at || "";
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [jobs, searchQuery, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredJobs.map((j) => j.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (jobId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  };

  const handleBulkAction = (status: PipelineStatus) => {
    onBulkStatusChange([...selectedIds], status);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    onDeleteMultiple([...selectedIds]);
    setSelectedIds(new Set());
  };

  const startEditNotes = (job: JobWithMatch) => {
    setEditingNotesId(job.id);
    setEditingNotesValue(job.notes || "");
  };

  const saveNotes = (jobId: string) => {
    onNotesChange(jobId, editingNotesValue);
    setEditingNotesId(null);
    setEditingNotesValue("");
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return dateStr;
    }
  };

  const allSelected = filteredJobs.length > 0 && selectedIds.size === filteredJobs.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredJobs.length;

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No jobs in this section</p>
        <p className="text-sm mt-1">Jobs will appear here when you move them from Inbox</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with search and bulk actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Input
          placeholder="Search by title or company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <>
              {availableActions.moveToInbox && (
                <Button variant="outline" size="sm" onClick={() => handleBulkAction("inbox")}>
                  <Inbox className="h-4 w-4 mr-2" />
                  To Inbox ({selectedIds.size})
                </Button>
              )}
              {availableActions.moveToShortlist && (
                <Button variant="outline" size="sm" onClick={() => handleBulkAction("shortlist")}>
                  <Star className="h-4 w-4 mr-2" />
                  To Shortlist ({selectedIds.size})
                </Button>
              )}
              {availableActions.moveToNotAFit && (
                <Button variant="outline" size="sm" onClick={() => handleBulkAction("not_fit")}>
                  <XCircle className="h-4 w-4 mr-2" />
                  To Not a Fit ({selectedIds.size})
                </Button>
              )}
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
                      This will permanently delete {selectedIds.size} job{selectedIds.size > 1 ? "s" : ""}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredJobs.length} of {jobs.length} jobs
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate = someSelected;
                  }}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort("title")} className="-ml-3">
                  Title
                  <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort("company")} className="-ml-3">
                  Company
                  <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Location</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort("date_posted")} className="-ml-3">
                  Posted
                  <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => handleSort("match_score")} className="-ml-3">
                  Score
                  <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Work Type</TableHead>
              <TableHead>Salary</TableHead>
              <TableHead>Notes</TableHead>
              {showAIColumn && <TableHead>AI</TableHead>}
              {showStageColumn && <TableHead>Stage</TableHead>}
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredJobs.map((job) => (
              <TableRow key={job.id} className={selectedIds.has(job.id) ? "bg-muted/50" : ""}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(job.id)}
                    onCheckedChange={(checked) => handleSelectOne(job.id, !!checked)}
                  />
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => setSelectedJob(job)}
                    className="text-left font-medium hover:text-primary hover:underline max-w-[200px] truncate block"
                  >
                    {job.title}
                  </button>
                </TableCell>
                <TableCell className="max-w-[150px] truncate">{job.company}</TableCell>
                <TableCell className="max-w-[120px] truncate">{job.location}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatDate(job.date_posted)}
                </TableCell>
                <TableCell>
                  {job.match ? (
                    <MatchScoreBadge score={job.match.match_score} recommendation={job.match.recommendation} />
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {job.work_type && <Badge variant="secondary" className="text-xs">{job.work_type}</Badge>}
                </TableCell>
                <TableCell className="text-sm max-w-[100px] truncate">
                  {job.salary_range || "-"}
                </TableCell>
                <TableCell className="max-w-[150px]">
                  {editingNotesId === job.id ? (
                    <div className="flex gap-1">
                      <Input
                        value={editingNotesValue}
                        onChange={(e) => setEditingNotesValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveNotes(job.id);
                          if (e.key === "Escape") setEditingNotesId(null);
                        }}
                        className="h-7 text-xs"
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" onClick={() => saveNotes(job.id)} className="h-7 px-2">
                        Save
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditNotes(job)}
                      className="text-sm text-muted-foreground hover:text-foreground truncate block max-w-[150px] text-left"
                    >
                      {job.notes || "Add notes..."}
                    </button>
                  )}
                </TableCell>
                {showAIColumn && onGenerateResume && onGenerateCoverLetter && (
                  <TableCell>
                    <ArtifactGeneratorButtons
                      matchScore={job.match?.match_score}
                      hasResume={!!getJobArtifact(job.id, 'tailored_resume')}
                      hasCoverLetter={!!getJobArtifact(job.id, 'cover_letter')}
                      onGenerateResume={async () => {
                        const result = await onGenerateResume(job);
                        onViewResume?.(result);
                      }}
                      onGenerateCoverLetter={async () => {
                        const result = await onGenerateCoverLetter(job);
                        onViewCoverLetter?.(result);
                      }}
                      onViewResume={() => {
                        const artifact = getJobArtifact(job.id, 'tailored_resume');
                        if (artifact) onViewResume?.(artifact.content as TailoredResume);
                      }}
                      onViewCoverLetter={() => {
                        const artifact = getJobArtifact(job.id, 'cover_letter');
                        if (artifact) onViewCoverLetter?.(artifact.content as CoverLetter);
                      }}
                      compact
                    />
                  </TableCell>
                )}
                {showStageColumn && (
                  <TableCell>
                    <Select
                      value={job.pipeline_status}
                      onValueChange={(value) => onStatusChange(job.id, value as PipelineStatus)}
                    >
                      <SelectTrigger className="h-8 text-xs w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stageOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                )}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <a href={job.job_url} target="_blank" rel="noopener noreferrer" className="flex items-center">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View on SEEK
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {availableActions.moveToInbox && (
                        <DropdownMenuItem onClick={() => onStatusChange(job.id, "inbox")}>
                          <Inbox className="h-4 w-4 mr-2" />
                          Move to Inbox
                        </DropdownMenuItem>
                      )}
                      {availableActions.moveToShortlist && (
                        <DropdownMenuItem onClick={() => onStatusChange(job.id, "shortlist")}>
                          <Star className="h-4 w-4 mr-2" />
                          Move to Shortlist
                        </DropdownMenuItem>
                      )}
                      {availableActions.moveToNotAFit && (
                        <DropdownMenuItem onClick={() => onStatusChange(job.id, "not_fit")}>
                          <XCircle className="h-4 w-4 mr-2" />
                          Move to Not a Fit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onDelete(job.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <JobDetailModal job={selectedJob} open={!!selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}
