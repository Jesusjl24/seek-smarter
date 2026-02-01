import { ExternalLink, MapPin, Building2, Calendar, Trash2, Star, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MatchScoreBadge } from "./MatchScoreBadge";
import type { JobWithMatch } from "@/types/job";
import { formatDistanceToNow } from "date-fns";

interface JobCardProps {
  job: JobWithMatch;
  onScore: (jobId: string) => void;
  onDelete: (jobId: string) => void;
  onViewDetails: (job: JobWithMatch) => void;
  onShortlist: (jobId: string) => void;
  onNotAFit: (jobId: string) => void;
  isScoring: boolean;
  hasResume: boolean;
  isSelected?: boolean;
  onSelectChange?: (jobId: string, selected: boolean) => void;
}

export function JobCard({
  job,
  onScore,
  onDelete,
  onViewDetails,
  onShortlist,
  onNotAFit,
  isScoring,
  hasResume,
  isSelected = false,
  onSelectChange,
}: JobCardProps) {
  const datePosted = job.date_posted
    ? formatDistanceToNow(new Date(job.date_posted), { addSuffix: true })
    : null;

  return (
    <Card className={`hover:shadow-md transition-shadow ${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {onSelectChange && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onSelectChange(job.id, !!checked)}
                className="mt-1"
              />
            )}
            <div className="flex-1 min-w-0">
            <CardTitle className="text-lg leading-tight line-clamp-2">
              <button
                onClick={() => onViewDetails(job)}
                className="hover:text-primary transition-colors text-left"
              >
                {job.title}
              </button>
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <Building2 className="h-3.5 w-3.5" />
              <span className="truncate">{job.company}</span>
            </div>
            </div>
          </div>
          {job.match && (
            <MatchScoreBadge
              score={job.match.match_score}
              recommendation={job.match.recommendation}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            <span>{job.location}</span>
          </div>
          {datePosted && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>{datePosted}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {job.work_type && (
            <Badge variant="secondary" className="text-xs">
              {job.work_type}
            </Badge>
          )}
          {job.work_arrangement && (
            <Badge variant="outline" className="text-xs">
              {job.work_arrangement}
            </Badge>
          )}
          {job.salary_range && (
            <Badge variant="outline" className="text-xs">
              {job.salary_range}
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2">
          {job.description_snippet}
        </p>

        <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
          <div className="flex gap-1.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onShortlist(job.id)}
              title="Move to Shortlist"
            >
              <Star className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNotAFit(job.id)}
              title="Move to Not a Fit"
            >
              <XCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onScore(job.id)}
              disabled={isScoring || !hasResume || !!job.match}
            >
              {job.match ? "Scored" : isScoring ? "Scoring..." : "Score"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(job.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <a
            href={job.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View on SEEK
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
