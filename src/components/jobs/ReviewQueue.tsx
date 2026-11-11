import { useEffect, useState } from "react";
import { ArrowRight, Star, XCircle } from "lucide-react"
import { SeekLink } from "@/components/jobs/SeekLink";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { classifyScore, BAND_LABELS } from "@/lib/policy";
import type { JobWithMatch } from "@/types/job";
import type { ScorePolicy } from "@/types/preferences";

interface ReviewQueueProps {
  /** Ordered queue of jobs to review, highest priority first. */
  queue: JobWithMatch[];
  startId: string | null;
  policy: ScorePolicy;
  onClose: () => void;
  onShortlist: (jobId: string) => void;
  onNotAFit: (jobId: string) => void;
}

/**
 * Sequential "Review next" flow: read the reasoning, decide, move straight on
 * to the next role without going back to the list.
 */
export function ReviewQueue({
  queue,
  startId,
  policy,
  onClose,
  onShortlist,
  onNotAFit,
}: ReviewQueueProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!startId) return;
    const i = queue.findIndex((j) => j.id === startId);
    setIndex(i >= 0 ? i : 0);
  }, [startId, queue]);

  const open = !!startId && queue.length > 0;
  const job = queue[Math.min(index, Math.max(queue.length - 1, 0))];
  if (!open || !job) return null;

  const match = job.match;
  const band = match ? classifyScore(match.match_score, policy) : null;
  const isLast = index >= queue.length - 1;

  const advance = () => {
    if (isLast) onClose();
    else setIndex((i) => i + 1);
  };

  const decide = (fn: (id: string) => void) => {
    fn(job.id);
    advance();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[88vh] max-w-2xl overflow-y-auto"
        data-testid="review-queue"
      >
        <DialogHeader>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Reviewing {index + 1} of {queue.length}
          </p>
          <DialogTitle className="pr-8 text-xl">{job.title}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {job.company} · {job.location}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {match ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-semibold tabular-nums">
                  {match.match_score}
                </span>
                <span className="text-sm font-medium">
                  {band ? BAND_LABELS[band] : ""}
                </span>
              </div>
              {match.reasoning && <p className="text-sm">{match.reasoning}</p>}

              {(match.dealbreaker_hits?.length ?? 0) > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <p className="font-medium text-destructive">Hard blockers</p>
                  <ul className="mt-1 list-disc pl-5 text-destructive">
                    {match.dealbreaker_hits!.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {match.pros?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium">Strengths</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      {match.pros.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {match.cons?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium">Concerns</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      {match.cons.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {match.strategic_advice && (
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <p className="font-medium">Advice</p>
                  <p className="mt-1 text-muted-foreground">{match.strategic_advice}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This role has not been assessed yet.
            </p>
          )}

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => decide(onShortlist)} data-testid="review-shortlist">
              <Star className="mr-1.5 h-4 w-4" aria-hidden />
              Shortlist
            </Button>
            <Button variant="outline" onClick={() => decide(onNotAFit)}>
              <XCircle className="mr-1.5 h-4 w-4" aria-hidden />
              Not a fit
            </Button>
            <Button variant="ghost" onClick={advance} data-testid="review-next">
              {isLast ? "Finish" : "Review next"}
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Button>
            <SeekLink job={job} label="View on SEEK" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
