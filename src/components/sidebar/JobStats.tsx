import { Briefcase, CheckCircle, Clock } from "lucide-react";

interface JobStatsProps {
  totalJobs: number;
  scoredJobs: number;
  recentJobs: number;
}

export function JobStats({ totalJobs, scoredJobs, recentJobs }: JobStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="bg-muted/50 rounded-lg p-2">
        <div className="flex justify-center mb-1">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-lg font-semibold">{totalJobs}</div>
        <div className="text-xs text-muted-foreground">Total</div>
      </div>
      <div className="bg-muted/50 rounded-lg p-2">
        <div className="flex justify-center mb-1">
          <CheckCircle className="h-4 w-4 text-green-500" />
        </div>
        <div className="text-lg font-semibold">{scoredJobs}</div>
        <div className="text-xs text-muted-foreground">Scored</div>
      </div>
      <div className="bg-muted/50 rounded-lg p-2">
        <div className="flex justify-center mb-1">
          <Clock className="h-4 w-4 text-blue-500" />
        </div>
        <div className="text-lg font-semibold">{recentJobs}</div>
        <div className="text-xs text-muted-foreground">Today</div>
      </div>
    </div>
  );
}
