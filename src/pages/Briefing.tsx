import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ChevronDown, Clock3 } from "lucide-react";
import { fetchBriefing, fetchBriefings, fetchLatestBriefing, restoreJob, sendJobFeedback } from "@/lib/api/briefings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { isGuest } from "@/lib/guest";

const labels: Record<string, string> = { below_salary: "below salary", contract: "contract or temporary", industry: "excluded industry", weak_fit: "weak fit" };

function JobCard({ job, refresh }: { job: any; refresh: () => void }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const { toast } = useToast();
  const act = async (action: string) => {
    if (isGuest() || String(job.id).startsWith("demo")) {
      toast({ title: "Demo only", description: "Sign in to keep feedback." });
      return;
    }
    await sendJobFeedback(job.id, action, reason || undefined);
    toast({ title: action === "applied" ? "Marked as applied" : action === "save_for_later" ? "Saved for later" : "Feedback saved" });
    refresh();
  };
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg leading-snug">{job.title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{job.company} · {job.location}</p>
          </div>
          <Badge className="shrink-0">{job.grade}</Badge>
        </div>
        <p className="text-sm font-medium">{job.salary_range || "Salary not listed"}</p>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <p className="text-sm leading-6">{job.why_apply || "A strong match for your stated direction."}</p>
        {job.risks && <div className="rounded-md bg-amber-500/10 p-3 text-sm"><span className="font-medium">Key risk: </span>{job.risks}</div>}
        <p className="text-sm"><span className="font-medium">Chance: </span>{job.chance_estimate || "Not estimated"}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild className="min-h-11 w-full sm:w-auto">
            <a href={job.job_url} target="_blank" rel="noreferrer">Open on SEEK <ExternalLink className="ml-2 h-4 w-4" /></a>
          </Button>
          <Link className="text-sm text-primary hover:underline" to={`/run/jobs/${job.id}`}>How this was decided</Link>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button className="min-h-11" variant="outline" onClick={() => act("applied")}>Applied</Button>
          <Button className="min-h-11" variant="outline" onClick={() => act("save_for_later")}>Save for later</Button>
          <Button className="min-h-11" variant="ghost" onClick={() => setRejecting(!rejecting)}>Not for me</Button>
        </div>
        {rejecting && (
          <div className="space-y-2">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What made this a poor fit?" />
            <Button className="min-h-11 w-full" variant="destructive" onClick={() => act("not_for_me")}>Save feedback</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const guestSample = {
  briefing_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date()),
  summary_text: "This is a sample briefing so you can see the layout. Sign in to get your real morning brief.",
  market_notes: "Demo only — no live SEEK search runs in guest mode.",
  stats: { filtered_out: 0 },
  recommendations: [{ id: "demo", title: "Operations Manager", company: "Example Co", location: "Sydney (Hybrid)", salary_range: "$150,000 - $175,000", grade: "A", why_apply: "A senior operations remit that lines up with a transformation brief, without asking you to browse a job board.", risks: "Sample card only; the live job may differ.", chance_estimate: "Demo", job_url: "https://www.seek.com.au" }],
  worth_a_look: [],
  filtered_counts: {},
  filtered_out_jobs: [],
};

export default function Briefing() {
  const [briefing, setBriefing] = useState<any>(undefined);
  const [history, setHistory] = useState<any[]>([]);
  const load = () => {
    if (isGuest()) {
      setBriefing(guestSample);
      setHistory([]);
      return Promise.resolve();
    }
    return Promise.all([fetchLatestBriefing(), fetchBriefings()]).then(([latest, items]) => {
      setBriefing(latest);
      setHistory(items);
    });
  };
  useEffect(() => { load().catch(() => setBriefing(null)); }, []);
  if (briefing === undefined) return <p className="py-12 text-center text-muted-foreground">Preparing your briefing…</p>;
  if (!briefing) return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <Clock3 className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
      <h1 className="text-2xl font-bold">Your briefing will be ready soon</h1>
      <p className="mt-3 leading-7 text-muted-foreground">Your daily briefing runs at 6:00 Australia/Sydney. You can also use the small Run now control in Settings.</p>
    </div>
  );
  const date = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "full" }).format(new Date(`${briefing.briefing_date}T12:00:00+11:00`));
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <header className="space-y-3">
        <p className="text-sm font-medium text-primary">DAILY BRIEFING</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Your briefing — {date}</h1>
        <p className="text-base leading-7">{briefing.summary_text}</p>
        <p>
          <Link className="text-sm font-medium text-primary hover:underline" to="/run">How this was decided</Link>
        </p>
        {briefing.market_notes && (
          <div className="rounded-lg border bg-muted/30 p-4">
            <h2 className="mb-1 font-semibold">Market notes</h2>
            <p className="text-sm leading-6 text-muted-foreground">{briefing.market_notes}</p>
          </div>
        )}
      </header>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Apply to these</h2>
        {briefing.recommendations.length
          ? briefing.recommendations.map((job: any) => <JobCard key={job.id} job={job} refresh={load} />)
          : <p className="rounded-lg border p-4 text-sm text-muted-foreground">No A-grade roles in this run. That’s time saved.</p>}
      </section>
      <Collapsible>
        <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between border-b text-left font-semibold">
          Worth a look ({briefing.worth_a_look.length})<ChevronDown className="h-4 w-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          {briefing.worth_a_look.map((job: any) => <JobCard key={job.id} job={job} refresh={load} />)}
        </CollapsibleContent>
      </Collapsible>
      <Collapsible>
        <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between border-b text-left font-semibold">
          Filtered out ({briefing.stats.filtered_out || 0})<ChevronDown className="h-4 w-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          {Object.entries(briefing.filtered_counts || {}).map(([key, value]) => (
            <div key={key} className="rounded-md bg-muted/40 p-3 text-sm">
              <div className="mb-2 flex justify-between">
                <span className="font-medium">{labels[key] || key}</span>
                <Badge variant="secondary">{String(value)}</Badge>
              </div>
              {(briefing.filtered_out_jobs || []).filter((job: any) => job.filter_reason === key).map((job: any) => (
                <div key={job.id} className="flex min-h-11 items-center justify-between gap-2 border-t py-2">
                  <span>{job.title} · {job.company}</span>
                  <div className="flex items-center gap-2">
                    <Link className="text-sm text-primary hover:underline" to={`/run/jobs/${job.id}`}>Why</Link>
                    <Button size="sm" variant="outline" onClick={async () => { await restoreJob(job.id); load(); }}>Restore</Button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Past briefings</h2>
        {history.slice(1).map((item) => (
          <button key={item.id} className="block min-h-11 w-full rounded-md border p-3 text-left" onClick={async () => setBriefing(await fetchBriefing(item.id))}>
            <span className="font-medium">{item.briefing_date}</span>
            <span className="ml-2 text-sm text-muted-foreground">{item.summary_text}</span>
          </button>
        ))}
      </section>
    </div>
  );
}
