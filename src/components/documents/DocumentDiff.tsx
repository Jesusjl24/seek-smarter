import { useMemo } from "react";
import { diffLines, diffStats } from "@/lib/documents/diff";

interface DocumentDiffProps {
  beforeLabel: string;
  afterLabel: string;
  before: string[];
  after: string[];
}

export function DocumentDiff({ beforeLabel, afterLabel, before, after }: DocumentDiffProps) {
  const diff = useMemo(() => diffLines(before, after), [before, after]);
  const stats = useMemo(() => diffStats(diff), [diff]);

  return (
    <div className="space-y-2" data-testid="document-diff">
      <p className="text-xs text-muted-foreground">
        {beforeLabel} → {afterLabel} · {stats.added} added · {stats.removed} removed ·{" "}
        {stats.unchanged} unchanged
      </p>
      <div className="max-h-80 overflow-y-auto rounded-md border font-mono text-xs">
        {diff.map((line, index) => (
          <div
            key={`${index}-${line.text}`}
            data-op={line.op}
            className={
              line.op === "added"
                ? "flex gap-2 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400"
                : line.op === "removed"
                  ? "flex gap-2 bg-destructive/10 px-2 py-0.5 text-destructive line-through"
                  : "flex gap-2 px-2 py-0.5 text-muted-foreground"
            }
          >
            <span aria-hidden className="w-3 shrink-0">
              {line.op === "added" ? "+" : line.op === "removed" ? "−" : " "}
            </span>
            <span className="whitespace-pre-wrap break-words">{line.text || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
