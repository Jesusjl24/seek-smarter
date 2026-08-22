import { AlertTriangle, CheckCircle2, HelpCircle, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TruthCheckStatus } from "@/lib/documents/truthCheck";

const MAP: Record<
  TruthCheckStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  passed: {
    label: "Truth check passed",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  failed: {
    label: "Truth check failed",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    Icon: XCircle,
  },
  needs_evidence: {
    label: "Needs evidence",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    Icon: AlertTriangle,
  },
  manually_approved: {
    label: "Manually approved",
    className: "border-primary/40 bg-primary/10 text-primary",
    Icon: ShieldCheck,
  },
  pending: {
    label: "Truth check pending",
    className: "border-muted-foreground/30 bg-muted text-muted-foreground",
    Icon: HelpCircle,
  },
};

export function TruthCheckBadge({ status }: { status: TruthCheckStatus }) {
  const config = MAP[status] ?? MAP.pending;
  const { Icon } = config;
  return (
    <Badge
      variant="outline"
      className={config.className}
      data-testid="truth-check-badge"
      data-status={status}
    >
      <Icon className="mr-1 h-3.5 w-3.5" aria-hidden />
      {config.label}
    </Badge>
  );
}
