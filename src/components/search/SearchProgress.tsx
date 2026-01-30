import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface SearchProgressProps {
  isSearching: boolean;
}

const stages = [
  { message: "Connecting to SEEK...", progress: 10 },
  { message: "Loading search results...", progress: 25 },
  { message: "Scraping job listing 1...", progress: 35 },
  { message: "Scraping job listing 5...", progress: 45 },
  { message: "Scraping job listing 10...", progress: 55 },
  { message: "Scraping job listing 15...", progress: 70 },
  { message: "Scraping job listing 20...", progress: 85 },
  { message: "Processing results...", progress: 95 },
];

export function SearchProgress({ isSearching }: SearchProgressProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

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
  }, [isSearching]);

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
            This may take a moment...
          </p>
        </div>
      </div>
    </div>
  );
}
