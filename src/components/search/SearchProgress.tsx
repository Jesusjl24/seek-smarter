import { useState, useEffect, useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface SearchProgressProps {
  isSearching: boolean;
  jobLimit?: number;
}

function generateStages(limit: number) {
  const stages = [
    { message: "Connecting to SEEK...", progress: 10 },
    { message: "Loading search results...", progress: 20 },
  ];

  // Generate scraping stages based on actual job limit
  const scrapingSteps = Math.min(5, Math.ceil(limit / 5)); // Max 5 intermediate steps
  const progressPerStep = 60 / (scrapingSteps + 1); // 60% of progress for scraping
  
  for (let i = 1; i <= scrapingSteps; i++) {
    const jobNumber = Math.min(Math.round((i / scrapingSteps) * limit), limit);
    const progress = Math.round(20 + (i * progressPerStep));
    stages.push({ message: `Scraping job listing ${jobNumber} of ${limit}...`, progress });
  }

  stages.push({ message: "Processing results...", progress: 90 });
  stages.push({ message: "Saving to database...", progress: 95 });

  return stages;
}

export function SearchProgress({ isSearching, jobLimit = 20 }: SearchProgressProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const stages = useMemo(() => generateStages(jobLimit), [jobLimit]);

  useEffect(() => {
    if (!isSearching) {
      setStageIndex(0);
      setProgress(0);
      return;
    }

    // Start the progress animation
    setProgress(stages[0].progress);
    setStageIndex(0);

    const interval = setInterval(() => {
      setStageIndex((prev) => {
        const next = prev + 1;
        if (next >= stages.length) {
          return prev; // Stay at last stage
        }
        setProgress(stages[next].progress);
        return next;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [isSearching, stages]);

  if (!isSearching) return null;

  const currentStage = stages[stageIndex];

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
      <div className="bg-card border rounded-lg shadow-lg p-8 max-w-md w-full mx-4 animate-scale-in">
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
          </div>
          
          <div className="space-y-2 w-full">
            <h3 className="text-lg font-semibold">Searching SEEK</h3>
            <p className="text-sm text-muted-foreground h-5">
              {currentStage.message}
            </p>
          </div>

          <div className="w-full space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {progress}% complete
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Scraping {jobLimit} jobs...
          </p>
        </div>
      </div>
    </div>
  );
}
