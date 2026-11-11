import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { seekUrl } from "@/lib/jobUrl";

export function SeekLink({
  job,
  label = "View on SEEK",
  variant = "link",
  className,
}: {
  job?: { job_url?: string | null; seek_job_id?: string | number | null } | null;
  label?: string;
  variant?: "link" | "button";
  className?: string;
}) {
  const href = seekUrl(job);
  if (!href) return null;
  if (variant === "button") {
    return (
      <Button asChild className={className || "min-h-11 w-full sm:w-auto"}>
        <a href={href} target="_blank" rel="noreferrer">
          {label} <ExternalLink className="ml-2 h-4 w-4" />
        </a>
      </Button>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className || "inline-flex items-center gap-1 text-sm text-primary hover:underline"}>
      {label} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
