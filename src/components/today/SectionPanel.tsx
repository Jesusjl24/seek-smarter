import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionPanelProps {
  title: string;
  description?: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  testId?: string;
  className?: string;
}

export function SectionPanel({
  title,
  description,
  count,
  action,
  children,
  emptyMessage,
  isEmpty,
  testId,
  className,
}: SectionPanelProps) {
  return (
    <section
      data-testid={testId}
      className={cn("rounded-lg border bg-card", className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">
            {title}
            {typeof count === "number" && (
              <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                {count}
              </span>
            )}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </header>
      <div className="px-4 py-3">
        {isEmpty ? (
          <p className="py-2 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
