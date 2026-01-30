import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MatchScoreBadgeProps {
  score: number;
  recommendation?: string;
  showLabel?: boolean;
}

export function MatchScoreBadge({
  score,
  recommendation,
  showLabel = true,
}: MatchScoreBadgeProps) {
  const getScoreColor = () => {
    if (score >= 80) return "bg-green-500 hover:bg-green-600 text-white";
    if (score >= 60) return "bg-blue-500 hover:bg-blue-600 text-white";
    if (score >= 40) return "bg-yellow-500 hover:bg-yellow-600 text-white";
    return "bg-gray-400 hover:bg-gray-500 text-white";
  };

  const getLabel = () => {
    if (recommendation) return recommendation;
    if (score >= 80) return "Strong Match";
    if (score >= 60) return "Good Match";
    if (score >= 40) return "Moderate Match";
    return "Weak Match";
  };

  return (
    <Badge className={cn("font-semibold", getScoreColor())}>
      {score}%{showLabel && ` · ${getLabel()}`}
    </Badge>
  );
}
