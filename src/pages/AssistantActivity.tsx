import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileText, HelpCircle, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionPanel } from "@/components/today/SectionPanel";
import { fetchAssistantSnapshot } from "@/lib/api/assistant";
import { useToast } from "@/hooks/use-toast";
import type { AssistantSnapshot } from "@/types/assistant";
import { formatDistanceToNow } from "date-fns";

const AssistantActivity = () => {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setSnapshot(await fetchAssistantSnapshot());
    } catch (e) {
      console.error("Failed to load assistant activity:", e);
      toast({ title: "Could not load assistant activity", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !snapshot) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const lastRun = snapshot.last_run_at
    ? formatDistanceToNow(new Date(snapshot.last_run_at), { addSuffix: true })
    : "never";

  return (
    <div className="space-y-6" data-testid="assistant-activity-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assistant Activity</h1>
          <p className="text-sm text-muted-foreground">
            Everything the Job Assistant has produced, and everything it is waiting on.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" data-testid="assistant-connection">
            {snapshot.assistant_connected ? "Connected" : "Not connected"}
          </Badge>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
            Refresh
          </Button>
        </div>
      </header>

      <SectionPanel
        testId="assistant-latest-run"
        title="Latest run"
        description={`Last ingestion ${lastRun}.`}
      >
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Jobs found</dt>
            <dd className="text-lg font-semibold tabular-nums">{snapshot.jobs_found}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Jobs assessed</dt>
            <dd className="text-lg font-semibold tabular-nums">{snapshot.jobs_assessed}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Strong Apply</dt>
            <dd className="text-lg font-semibold tabular-nums text-success">
              {snapshot.strong_apply}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Review</dt>
            <dd className="text-lg font-semibold tabular-nums text-warning">
              {snapshot.review}
            </dd>
          </div>
        </dl>
      </SectionPanel>

      <SectionPanel
        testId="assistant-questions"
        title="Questions for you"
        count={snapshot.questions.length}
        isEmpty={snapshot.questions.length === 0}
        emptyMessage="No open questions."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link to="/today">Answer in Today</Link>
          </Button>
        }
      >
        <ul className="divide-y">
          {snapshot.questions.map((q) => (
            <li key={q.job_id} className="flex items-center gap-3 py-2 text-sm">
              <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{q.title}</span>{" "}
                <span className="text-muted-foreground">· {q.question}</span>
              </span>
              <span className="tabular-nums text-muted-foreground">{q.score}</span>
            </li>
          ))}
        </ul>
      </SectionPanel>

      <SectionPanel
        testId="assistant-outputs"
        title="Documents produced"
        count={snapshot.documents_ready.length}
        isEmpty={snapshot.documents_ready.length === 0}
        emptyMessage="No documents produced yet."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link to="/documents">Open Documents</Link>
          </Button>
        }
      >
        <ul className="divide-y">
          {snapshot.documents_ready.map((d) => (
            <li key={`${d.job_id}-${d.kind}-${d.created_at}`} className="flex items-center gap-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{d.title}</span>{" "}
                <span className="text-muted-foreground">
                  · {d.kind === "tailored_resume" ? "Tailored resume" : "Cover letter"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </SectionPanel>

      <SectionPanel
        testId="assistant-packages"
        title="Packages ready for approval"
        count={snapshot.packages_ready.length}
        isEmpty={snapshot.packages_ready.length === 0}
        emptyMessage="No complete application packages yet."
      >
        <ul className="divide-y">
          {snapshot.packages_ready.map((p) => (
            <li key={p.job_id} className="flex items-center gap-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{p.title}</span>{" "}
                <span className="text-muted-foreground">· {p.company}</span>
              </span>
              <span className="text-xs text-muted-foreground">{p.band_label}</span>
            </li>
          ))}
        </ul>
      </SectionPanel>

      <SectionPanel
        testId="assistant-failures"
        title="Retryable failures"
        count={snapshot.failures.length}
        isEmpty={snapshot.failures.length === 0}
        emptyMessage="No failures to retry."
      >
        <ul className="divide-y">
          {snapshot.failures.map((f) => (
            <li key={f.job_id} className="flex items-center gap-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{f.title}</span>{" "}
                <span className="text-muted-foreground">· {f.reason}</span>
              </span>
            </li>
          ))}
        </ul>
      </SectionPanel>

      <SectionPanel
        testId="assistant-telegram"
        title="Telegram activity"
        description="Notifications relayed to your Telegram channel."
        isEmpty={!snapshot.telegram.connected}
        emptyMessage="Telegram is not connected, so there is no activity to show."
        action={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Send className="h-3.5 w-3.5" aria-hidden />
            Not connected
          </span>
        }
      >
        <ul className="divide-y">
          {snapshot.telegram.events.map((e) => (
            <li key={e.id} className="py-2 text-sm">
              {e.text}
            </li>
          ))}
        </ul>
      </SectionPanel>
    </div>
  );
};

export default AssistantActivity;
