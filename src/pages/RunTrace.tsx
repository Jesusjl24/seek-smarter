import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { fetchLatestTrace } from "@/lib/api/traces";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { isGuest } from "@/lib/guest";

const guestTrace = {
  id: "demo",
  status: "completed",
  summary_text: "This is a sample walkthrough so you can see how a run is explained. Sign in to see your real briefing trail.",
  funnel: { found: 24, passed_filters: 17, graded: 8, picks: 3, worth_a_look: 4, dropped: 7 },
  funnel_text: "24 found → 17 passed filters → 8 graded → 3 picks",
  steps: [
    { stage: "scout", label: "Scout", actor_type: "script", actor_name: "SEEK search via Firecrawl", inputs_summary: "Ran 3 saved searches: Digital Transformation Lead, Operations Manager, CRM Manager.", outputs_summary: "Found 24 listings across the saved searches.", counts: { found: 24, searches: 3 }, error: null },
    { stage: "gatekeeper", label: "Gatekeeper", actor_type: "script", actor_name: "Salary, contract, industry, and duplicate checks", inputs_summary: "Checked 24 listings against your salary floor, full-time preference, and industry exclusions.", outputs_summary: "17 passed the filters; 7 were dropped.", counts: { kept: 17, dropped: 7 }, error: null },
    { stage: "matcher", label: "Matcher", actor_type: "agent", actor_name: "Grades each role against your resume and goals", model: "grok-4.3", inputs_summary: "Graded the roles that passed the filters against your resume and goals.", outputs_summary: "This is a demo — in a live run Matcher only runs after you upload a resume.", counts: { graded: 8 }, error: null },
    { stage: "skeptic", label: "Analyst / Skeptic", actor_type: "script", actor_name: "Checks risks, chance, and whether the grade holds up", inputs_summary: "Reviewed each grade for consistency with salary, title, and stated risks.", outputs_summary: "One grade was flagged as optimistic; the rest held up.", counts: { reviewed: 8, flagged: 1 }, error: null },
    { stage: "briefer", label: "Briefer", actor_type: "agent", actor_name: "Writes the morning briefing", model: "grok-4.3", inputs_summary: "Wrote the briefing from the listings in this run.", outputs_summary: "3 roles made the apply-now list, and 4 were worth a look.", counts: { picks: 3 }, error: null },
  ],
  decisions: [
    { job_id: "demo-keep", title: "Digital Technical Lead", company: "Public Sector People", stage: "gatekeeper", decision: "kept", reason: "Passed the salary floor, full-time, and industry checks." },
    { job_id: "demo-drop", title: "Operations Manager", company: "Example Co", stage: "gatekeeper", decision: "dropped", reason: "Dropped because the listed salary $130,000–$180,000 sits below your $140,000 floor." },
  ],
};

function ActorBadge({ type }: { type: string }) {
  const isAgent = type === "agent";
  return <Badge variant={isAgent ? "default" : "secondary"} className="font-medium">{isAgent ? "Agent" : "Script"}</Badge>;
}

function StageCard({ step }: { step: any }) {
  return (
    <li className="relative pl-8">
      <span className="absolute left-[7px] top-2 h-2.5 w-2.5 rounded-full bg-primary" />
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{step.label}</h2>
            <ActorBadge type={step.actor_type} />
            {step.model && <span className="text-xs text-muted-foreground">used {step.model}</span>}
          </div>
          <p className="text-sm leading-6">{step.outputs_summary || "No summary for this step."}</p>
          <Collapsible>
            <CollapsibleTrigger className="flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground">
              Details <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-1 text-sm leading-6 text-muted-foreground">
              {step.inputs_summary && <p>{step.inputs_summary}</p>}
              {step.error && <p>Note: {step.error}</p>}
              {step.actor_name && <p>What ran: {step.actor_name}.</p>}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </li>
  );
}

function DecisionList({ title, items }: { title: string; items: any[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={`${item.job_id}-${item.stage}-${item.decision}`} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{item.title} · {item.company}</p>
              {item.job_id && !String(item.job_id).startsWith("demo") && (
                <Link className="text-sm text-primary hover:underline" to={`/run/jobs/${item.job_id}`}>See why</Link>
              )}
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function RunTrace() {
  const [params] = useSearchParams();
  const [trace, setTrace] = useState<any>(undefined);
  useEffect(() => {
    if (isGuest()) { setTrace(guestTrace); return; }
    fetchLatestTrace().then((body) => setTrace(body.trace)).catch(() => setTrace(null));
  }, []);
  if (trace === undefined) return <p className="py-12 text-center text-muted-foreground">Loading how this briefing was decided…</p>;
  if (!trace) return (
    <div className="mx-auto max-w-2xl py-12 text-center">
      <h1 className="text-2xl font-bold">No run to explain yet</h1>
      <p className="mt-3 leading-7 text-muted-foreground">Once a briefing has run, this page will show each step — scripts and agents — and why listings were kept, dropped, or picked.</p>
      <Link className="mt-6 inline-block text-primary hover:underline" to="/">Back to your briefing</Link>
    </div>
  );

  const decided = (trace.decisions || []).filter((item: any, index: number, all: any[]) => all.findIndex((other: any) => other.job_id === item.job_id && other.decision === item.decision) === index);
  const dropped = decided.filter((item: any) => item.decision === "dropped");
  const picked = decided.filter((item: any) => item.decision === "picked" || item.decision === "graded" || item.decision === "kept").filter((item: any, i: number, all: any[]) => {
    const best = ["picked", "graded", "kept"].find((decision) => all.some((row: any) => row.job_id === item.job_id && row.decision === decision));
    return item.decision === best && all.findIndex((row: any) => row.job_id === item.job_id && row.decision === best) === i;
  });
  const highlightJob = params.get("job");

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <header className="space-y-3">
        <p className="text-sm font-medium text-primary">HOW THIS WAS DECIDED</p>
        <h1 className="text-2xl font-bold sm:text-3xl">The path to this briefing</h1>
        <p className="text-base leading-7">{trace.funnel_text || trace.summary_text}</p>
        {trace.summary_text && <p className="text-sm leading-6 text-muted-foreground">{trace.summary_text}</p>}
      </header>
      <ol className="relative space-y-4 border-l border-border">
        {(trace.steps || []).map((step: any) => <StageCard key={step.id || step.stage} step={step} />)}
      </ol>
      <DecisionList title="What made the list" items={picked.filter((item: any) => !dropped.some((row: any) => row.job_id === item.job_id))} />
      <DecisionList title="What was filtered out" items={dropped} />
      {highlightJob && <p className="text-sm text-muted-foreground">Looking for a specific role? Open its decision trail from the job card.</p>}
      <p><Link className="text-primary hover:underline" to="/">Back to your briefing</Link></p>
    </div>
  );
}
