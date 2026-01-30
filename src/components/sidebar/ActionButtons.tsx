import { Download, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ActionButtonsProps {
  onScoreAll: () => void;
  onExport: () => void;
  isScoring: boolean;
  hasJobs: boolean;
  hasResume: boolean;
  unscoredCount: number;
}

export function ActionButtons({
  onScoreAll,
  onExport,
  isScoring,
  hasJobs,
  hasResume,
  unscoredCount,
}: ActionButtonsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={onScoreAll}
          disabled={isScoring || !hasJobs || !hasResume || unscoredCount === 0}
        >
          {isScoring ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Scoring...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Score All ({unscoredCount})
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onExport}
          disabled={!hasJobs}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </CardContent>
    </Card>
  );
}
