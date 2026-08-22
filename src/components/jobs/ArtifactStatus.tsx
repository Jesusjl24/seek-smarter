import { Check, FileText, Mail, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type ArtifactState = "ready" | "missing";

interface ArtifactStatusPillProps {
  kind: "tailored_resume" | "cover_letter";
  state: ArtifactState;
  className?: string;
}

const LABEL: Record<ArtifactStatusPillProps["kind"], string> = {
  tailored_resume: "Resume",
  cover_letter: "Cover letter",
};

export function ArtifactStatusPill({ kind, state, className }: ArtifactStatusPillProps) {
  const Icon = kind === "tailored_resume" ? FileText : Mail;
  const ready = state === "ready";
  return (
    <span
      data-testid={`artifact-status-${kind}`}
      data-state={state}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        ready
          ? "border-success/40 bg-success-soft text-success"
          : "border-border bg-muted/40 text-muted-foreground",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {LABEL[kind]}
      {ready ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Minus className="h-3.5 w-3.5" aria-hidden />
      )}
      <span className="sr-only">{ready ? "ready" : "not generated"}</span>
    </span>
  );
}
