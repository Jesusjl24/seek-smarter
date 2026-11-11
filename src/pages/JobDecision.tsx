import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchJobDecisionTrail } from "@/lib/api/traces";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { isGuest } from "@/lib/guest";
import { SeekLink } from "@/components/jobs/SeekLink";
import { JobReaction } from "@/components/jobs/JobReaction";

function ActorBadge({ type }: { type: string }) {
  return <Badge variant={type === "agent" ? "default" : "secondary"}>{type === "agent" ? "Agent" : "Script"}</Badge>;
}

export default function JobDecision() {
  const { jobId = "" } = useParams();
  const [trail, setTrail] = useState<any>(undefined);
  useEffect(() => {
    if (isGuest() || jobId.startsWith("demo")) {
      setTrail({
        job: { id: "demo", title: "Operations Manager", company: "Example Co", salary_range: "$130,000–$180,000", location: "Sydney", job_url: "https://www.seek.com.au/job/9000001" },
        stages: [{ stage: "scout", label: "Scout", actor_type: "script", decision: "found", reason: "This listing came from your Operations Manager search." }, { stage: "gatekeeper", label: "Gatekeeper", actor_type: "script", decision: "dropped", reason: "Dropped because the listed salary $130,000–$180,000 sits below your $140,000 floor.", evidence: [{ kind: "salary", text: "$130,000–$180,000" }] }],
      });
      return;
    }
    fetchJobDecisionTrail(jobId).then(setTrail).catch(() => setTrail(null));
  }, [jobId]);

  if (trail === undefined) return <p className="py-12 text-center text-muted-foreground">Loading this decision trail…</p>;
  if (!trail) return (
    <div className="mx-auto max-w-2xl py-12 text-center">
      <h1 className="text-2xl font-bold">We could not find that trail</h1>
      <p className="mt-3 leading-7 text-muted-foreground">The listing may have been removed, or it was not part of a recorded run.</p>
      <Link className="mt-6 inline-block text-primary hover:underline" to="/run">Back to the run</Link>
    </div>
  );

  const job = trail.job || {};
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">DECISION TRAIL</p>
        <h1 className="text-2xl font-bold sm:text-3xl">{job.title}</h1>
        <p className="text-muted-foreground">{job.company}{job.location ? ` · ${job.location}` : ""}</p>
        {job.salary_range && <p className="text-sm">{job.salary_range}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <SeekLink job={job} variant="button" />
          {job.id && !String(job.id).startsWith("demo") && <JobReaction jobId={job.id} />}
        </div>
      </header>
      <ol className="relative space-y-4 border-l border-border">
        {(trail.stages || []).map((stage: any, index: number) => (
          <li key={`${stage.stage}-${index}`} className="relative pl-8">
            <span className="absolute left-[7px] top-2 h-2.5 w-2.5 rounded-full bg-primary" />
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{stage.label}</h2>
                  <ActorBadge type={stage.actor_type} />
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{String(stage.decision).replace(/_/g, " ")}</span>
                </div>
                <p className="text-sm leading-6">{stage.reason}</p>
                {!!stage.evidence?.length && (
                  <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm leading-6">
                    <p className="font-medium">Evidence</p>
                    {stage.evidence.map((item: any, evIndex: number) => (
                      <p key={evIndex} className="text-muted-foreground">“{item.text}”</p>
                    ))}
                  </div>
                )}
                {stage.criteria && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">How the grade was built</p>
                    <ul className="space-y-2">
                      {Object.values(stage.criteria).map((item: any) => (
                        <li key={item.label} className="rounded-md border p-3 text-sm leading-6">
                          <div className="flex justify-between gap-3">
                            <span className="font-medium">{item.label}</span>
                            {item.score != null && <span className="text-muted-foreground">{item.score}/100</span>}
                          </div>
                          {item.note && <p className="mt-1 text-muted-foreground">{item.note}</p>}
                          {item.evidence && <p className="mt-1 text-muted-foreground">“{item.evidence}”</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      <p className="flex flex-wrap gap-4">
        <Link className="text-primary hover:underline" to="/run">Back to the run</Link>
        <Link className="text-primary hover:underline" to="/">Back to your briefing</Link>
      </p>
    </div>
  );
}
