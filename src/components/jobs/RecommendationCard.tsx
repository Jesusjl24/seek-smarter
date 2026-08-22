import {
  Building2,
  Calendar,
  ExternalLink,
  MapPin,
  MoreHorizontal,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArtifactStatusPill } from "./ArtifactStatus";
import { classifyScore, BAND_LABELS, type ScoreBand } from "@/lib/policy";
import { cn } from "@/lib/utils";
import type { JobWithMatch } from "@/types/job";
import type { ScorePolicy } from "@/types/preferences";
import { formatDistanceToNow } from "date-fns";

interface RecommendationCardProps {
  job: JobWithMatch;
  policy: ScorePolicy;
  onReview: (job: JobWithMatch) => void;
  onScore: (jobId: string) => void;
  onShortlist: (jobId: string) => void;
  onNotAFit: (jobId: string) => void;
  onDelete: (jobId: string) => void;
  isScoring: boolean;
  hasResume: boolean;
  hasTailoredResume?: boolean;
  hasCoverLetter?: boolean;
  isSelected?: boolean;
  onSelectChange?: (jobId: string, selected: boolean) => void;
}

const BAND_STYLES: Record<ScoreBand, { score: string; chip: string }> = {
  strong_apply: {
    score: "text-success",
    chip: "border-success/40 bg-success-soft text-success",
  },
  review: {
    score: "text-warning",
    chip: "border-warning/40 bg-warning-soft text-warning",
  },
  deprioritise: {
    score: "text-muted-foreground",
    chip: "border-border bg-muted/50 text-muted-foreground",
  },
};

export function RecommendationCard({
  job,
  policy,
  onReview,
  onScore,
  onShortlist,
  onNotAFit,
  onDelete,
  isScoring,
  hasResume,
  hasTailoredResume = false,
  hasCoverLetter = false,
  isSelected = false,
  onSelectChange,
}: RecommendationCardProps) {
  const match = job.match;
  const band = match ? classifyScore(match.match_score, policy) : null;
  const styles = band ? BAND_STYLES[band] : null;
  const datePosted = job.date_posted
    ? formatDistanceToNow(new Date(job.date_posted), { addSuffix: true })
    : null;

  const blockers = match?.dealbreaker_hits ?? [];
  const concerns = match?.concerns ?? [];
  const reasoning = match?.reasoning ?? job.description_snippet;

  const nextAction = !match
    ? hasResume
      ? "Assess this role"
      : "Upload a resume to assess"
    : band === "strong_apply"
      ? "Review recommendation, then shortlist"
      : band === "review"
        ? "Read the reasoning before deciding"
        : "Likely not worth the effort";

  return (
    <Card
      data-testid="job-recommendation-card"
      data-band={band ?? "unscored"}
      className={cn(
        "border-border/80 shadow-none transition-colors",
        isSelected && "ring-2 ring-ring"
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {onSelectChange && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelectChange(job.id, !!checked)}
              aria-label={`Select ${job.title}`}
              className="mt-1.5"
            />
          )}

          {/* Score column — strongest element on the card */}
          <div className="w-16 shrink-0 text-center">
            {match ? (
              <>
                <div
                  data-testid="job-score"
                  className={cn("text-3xl font-semibold leading-none tabular-nums", styles?.score)}
                >
                  {match.match_score}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  score
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">Not
                <br />assessed
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <button
                  onClick={() => onReview(job)}
                  className="text-left text-base font-semibold leading-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                >
                  {job.title}
                </button>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" aria-hidden />
                    {job.company}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {job.location}
                  </span>
                  {datePosted && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" aria-hidden />
                      {datePosted}
                    </span>
                  )}
                </div>
              </div>
              {band && (
                <span
                  data-testid="job-band"
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-xs font-medium",
                    styles?.chip
                  )}
                >
                  {BAND_LABELS[band]}
                </span>
              )}
            </div>

            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{reasoning}</p>

            {(blockers.length > 0 || concerns.length > 0) && (
              <div
                data-testid="job-blockers"
                className="mt-2 flex flex-wrap items-center gap-2 text-xs"
              >
                {blockers.map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-destructive"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                    {b}
                  </span>
                ))}
                {concerns.slice(0, 2).map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning-soft px-2 py-0.5 text-warning"
                  >
                    Uncertain: {c}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ArtifactStatusPill
                kind="tailored_resume"
                state={hasTailoredResume ? "ready" : "missing"}
              />
              <ArtifactStatusPill
                kind="cover_letter"
                state={hasCoverLetter ? "ready" : "missing"}
              />
              {job.work_type && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {job.work_type}
                </Badge>
              )}
              {job.salary_range && (
                <Badge variant="outline" className="text-xs font-normal">
                  {job.salary_range}
                </Badge>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p data-testid="job-next-action" className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Next:</span> {nextAction}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {match ? (
                  <Button
                    size="sm"
                    onClick={() => onReview(job)}
                    data-testid="review-recommendation"
                  >
                    Review recommendation
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="assistant"
                    onClick={() => onScore(job.id)}
                    disabled={isScoring || !hasResume}
                    data-testid="assess-job"
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
                    {isScoring ? "Assessing…" : "Assess"}
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onShortlist(job.id)}
                  className="hidden sm:inline-flex"
                >
                  <Star className="mr-1.5 h-4 w-4" aria-hidden />
                  Shortlist
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" aria-label={`More actions for ${job.title}`}>
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                      <span className="ml-1.5 sm:hidden">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => onReview(job)}>
                      Review recommendation
                    </DropdownMenuItem>
                    <DropdownMenuItem className="sm:hidden" onClick={() => onShortlist(job.id)}>
                      <Star className="mr-2 h-4 w-4" aria-hidden />
                      Move to Shortlist
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onNotAFit(job.id)}>
                      <XCircle className="mr-2 h-4 w-4" aria-hidden />
                      Move to Not a Fit
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={job.job_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                        Open on SEEK
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(job.id)}
                      className="text-muted-foreground focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                      Delete permanently
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
