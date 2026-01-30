import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MatchScoreBadge } from "./MatchScoreBadge";
import { ExternalLink, MapPin, Building2, Calendar, CheckCircle, XCircle, AlertTriangle, Lightbulb } from "lucide-react";
import type { JobWithMatch } from "@/types/job";
import { formatDistanceToNow } from "date-fns";

interface JobDetailModalProps {
  job: JobWithMatch | null;
  open: boolean;
  onClose: () => void;
}

export function JobDetailModal({ job, open, onClose }: JobDetailModalProps) {
  if (!job) return null;

  const datePosted = job.date_posted
    ? formatDistanceToNow(new Date(job.date_posted), { addSuffix: true })
    : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl pr-8">{job.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              <span className="font-medium text-foreground">{job.company}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{job.location}</span>
            </div>
            {datePosted && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{datePosted}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {job.work_type && <Badge variant="secondary">{job.work_type}</Badge>}
            {job.work_arrangement && (
              <Badge variant="outline">{job.work_arrangement}</Badge>
            )}
            {job.salary_range && (
              <Badge variant="outline">{job.salary_range}</Badge>
            )}
          </div>

          {job.match && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Match Analysis</h3>
                  <MatchScoreBadge
                    score={job.match.match_score}
                    recommendation={job.match.recommendation}
                  />
                </div>

                {job.match.skill_match_percentage !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Skill Match:
                    </span>
                    <span className="font-medium">
                      {job.match.skill_match_percentage}%
                    </span>
                  </div>
                )}

                {job.match.reasoning && (
                  <p className="text-sm">{job.match.reasoning}</p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {job.match.pros.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        Pros
                      </h4>
                      <ul className="text-sm space-y-1">
                        {job.match.pros.map((pro, i) => (
                          <li key={i} className="text-muted-foreground">
                            • {pro}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {job.match.cons.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5 text-red-600">
                        <XCircle className="h-4 w-4" />
                        Cons
                      </h4>
                      <ul className="text-sm space-y-1">
                        {job.match.cons.map((con, i) => (
                          <li key={i} className="text-muted-foreground">
                            • {con}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {job.match.gaps.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5 text-yellow-600">
                      <AlertTriangle className="h-4 w-4" />
                      Skill Gaps
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {job.match.gaps.map((gap, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {gap}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {job.match.strategic_advice && (
                  <div className="bg-muted/50 p-3 rounded-md">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
                      <Lightbulb className="h-4 w-4" />
                      Strategic Advice
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {job.match.strategic_advice}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />

          <div>
            <h3 className="font-semibold mb-2">Job Description</h3>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
              {job.full_description || job.description_snippet}
            </div>
          </div>

          <div className="flex justify-end">
            <Button asChild>
              <a
                href={job.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                View on SEEK
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
