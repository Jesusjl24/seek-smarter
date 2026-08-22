import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  MessageSquare,
  PackageCheck,
  RefreshCw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/today/StatTile";
import { SectionPanel } from "@/components/today/SectionPanel";
import { PolicyBar } from "@/components/policy/PolicyBar";
import { ReviewQueue } from "@/components/jobs/ReviewQueue";
import { fetchAssistantSnapshot } from "@/lib/api/assistant";
import { fetchPreferences, savePreferences } from "@/lib/api/preferences";
import { updateJobStatus } from "@/lib/api/jobs";
import { useLayoutContext } from "@/components/layout/MainLayout";
import { useToast } from "@/hooks/use-toast";
import { EMPTY_PREFERENCES, type CandidatePreferences, type ScorePolicy } from "@/types/preferences";
import type { AssistantSnapshot } from "@/types/assistant";
import { formatDistanceToNow } from "date-fns";

const Today = () => {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);
  const [prefs, setPrefs] = useState<CandidatePreferences>(EMPTY_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const { toast } = useToast();
  const { refreshCounts } = useLayoutContext();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [snap, p] = await Promise.all([fetchAssistantSnapshot(), fetchPreferences()]);
      setSnapshot(snap);
      setPrefs(p);
    } catch (e) {
      console.error("Failed to load Today:", e);
      toast({ title: "Could not load your workspace", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const policy: ScorePolicy = {
    policy_strong: prefs.policy_strong,
    policy_review: prefs.policy_review,
  };

  const handlePolicyChange = async (next: ScorePolicy) => {
    const updated = { ...prefs, ...next };
    setPrefs(updated);
    try {
      await savePreferences(updated);
      toast({ title: "Policy updated", description: "New bands applied across the app." });
    } catch {
      toast({ title: "Could not save policy", variant: "destructive" });
    }
  };

  const reviewQueue = useMemo(() => {
    if (!snapshot) return [];
    const ids = new Set(snapshot.questions.map((q) => q.job_id));
    return snapshot.run_jobs.filter((j) => ids.has(j.id));
  }, [snapshot]);

  const decide = async (jobId: string, status: "shortlist" | "not_fit") => {
    try {
      await updateJobStatus(jobId, status);
      await Promise.all([load(), refreshCounts()]);
    } catch {
      toast({ title: "Could not move that role", variant: "destructive" });
    }
  };

  if (loading || !snapshot) {
    return (
      <div className="space-y-4" data-testid="today-loading">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  const lastRun = snapshot.last_run_at
    ? formatDistanceToNow(new Date(snapshot.last_run_at), { addSuffix: true })
    : null;

  return (
    <div className="space-y-6" data-testid="today-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-muted-foreground" data-testid="today-last-run">
            {lastRun
              ? `Latest run ${lastRun} · ${snapshot.jobs_found} role${snapshot.jobs_found === 1 ? "" : "s"} in scope`
              : "No ingestion run yet — search the Job Inbox to bring roles in."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate("/")}>
            Go to Job Inbox
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
          </Button>
        </div>
      </header>

      <PolicyBar policy={policy} onChange={handlePolicyChange} compact />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile testId="today-stat-found" label="Jobs found" value={snapshot.jobs_found} />
        <StatTile
          testId="today-stat-assessed"
          label="Jobs assessed"
          value={snapshot.jobs_assessed}
          hint={`${Math.max(snapshot.jobs_found - snapshot.jobs_assessed, 0)} pending`}
        />
        <StatTile
          testId="today-stat-strong"
          label={`Strong Apply (${policy.policy_strong}+)`}
          value={snapshot.strong_apply}
          tone="success"
        />
        <StatTile
          testId="today-stat-review"
          label={`Review (${policy.policy_review}–${policy.policy_strong - 1})`}
          value={snapshot.review}
          tone="warning"
        />
        <StatTile
          testId="today-stat-deprioritise"
          label={`Deprioritise (<${policy.policy_review})`}
          value={snapshot.deprioritise}
          tone="muted"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionPanel
          testId="today-questions"
          title="Waiting on you"
          description="Assessed roles that still need a decision."
          count={snapshot.questions.length}
          isEmpty={snapshot.questions.length === 0}
          emptyMessage="Nothing waiting. Every assessed role has been filed."
          action={
            snapshot.questions.length > 0 ? (
              <Button
                size="sm"
                onClick={() => setReviewId(snapshot.questions[0].job_id)}
                data-testid="today-review-next"
              >
                Review next
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </Button>
            ) : undefined
          }
        >
          <ul className="divide-y">
            {snapshot.questions.slice(0, 6).map((q) => (
              <li key={q.job_id} className="flex items-center gap-3 py-2">
                <span className="w-9 shrink-0 text-lg font-semibold tabular-nums">
                  {q.score}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{q.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {q.company} · {q.band_label} · {q.question}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReviewId(q.job_id)}
                  data-testid="today-question-review"
                >
                  Review
                </Button>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <SectionPanel
          testId="today-documents"
          title="Documents ready for review"
          description="Tailored resumes and cover letters generated so far."
          count={snapshot.documents_ready.length}
          isEmpty={snapshot.documents_ready.length === 0}
          emptyMessage="No documents generated yet."
          action={
            <Button asChild size="sm" variant="ghost">
              <Link to="/documents">Open Documents</Link>
            </Button>
          }
        >
          <ul className="divide-y">
            {snapshot.documents_ready.slice(0, 6).map((d) => (
              <li key={`${d.job_id}-${d.kind}`} className="flex items-center gap-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.company} ·{" "}
                    {d.kind === "tailored_resume" ? "Tailored resume" : "Cover letter"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <SectionPanel
          testId="today-packages"
          title="Application packages ready for approval"
          description="Roles with both a tailored resume and a cover letter."
          count={snapshot.packages_ready.length}
          isEmpty={snapshot.packages_ready.length === 0}
          emptyMessage="No complete packages yet."
        >
          <ul className="divide-y">
            {snapshot.packages_ready.slice(0, 6).map((p) => (
              <li key={p.job_id} className="flex items-center gap-3 py-2">
                <PackageCheck className="h-4 w-4 shrink-0 text-success" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.company} · {p.band_label}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/documents">Open</Link>
                </Button>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <SectionPanel
          testId="today-failures"
          title="Retryable failures"
          description="Work that did not complete and can be run again."
          count={snapshot.failures.length}
          isEmpty={snapshot.failures.length === 0}
          emptyMessage="Nothing failed in the latest run."
          action={
            snapshot.failures.length > 0 ? (
              <Button asChild size="sm" variant="assistant">
                <Link to="/">Retry in Job Inbox</Link>
              </Button>
            ) : undefined
          }
        >
          <ul className="divide-y">
            {snapshot.failures.slice(0, 6).map((f) => (
              <li key={f.job_id} className="flex items-center gap-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {f.company} · {f.reason}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionPanel>
      </div>

      <SectionPanel
        testId="today-telegram"
        title="Recent Telegram activity"
        description="Assistant notifications sent to your Telegram channel."
        isEmpty={!snapshot.telegram.connected}
        emptyMessage="Telegram is not connected yet, so there is no activity to show."
        action={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Send className="h-3.5 w-3.5" aria-hidden />
            Not connected
          </span>
        }
      >
        <ul className="divide-y">
          {snapshot.telegram.events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
              <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="flex-1">{e.text}</span>
              <span className="text-xs text-muted-foreground">{e.at}</span>
            </li>
          ))}
        </ul>
      </SectionPanel>

      <ReviewQueue
        queue={reviewQueue}
        startId={reviewId}
        policy={policy}
        onClose={() => setReviewId(null)}
        onShortlist={(id) => decide(id, "shortlist")}
        onNotAFit={(id) => decide(id, "not_fit")}
      />
    </div>
  );
};

export default Today;
