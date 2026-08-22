import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "muted";
  testId?: string;
}

const TONES: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  muted: "text-muted-foreground",
};

export function StatTile({ label, value, hint, tone = "default", testId }: StatTileProps) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border bg-card px-4 py-3"
    >
      <div className={cn("text-2xl font-semibold tabular-nums leading-none", TONES[tone])}>
        {value}
      </div>
      <div className="mt-1.5 text-xs font-medium">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
