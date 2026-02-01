import { useState } from "react";
import { FileText, Mail, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ArtifactGeneratorButtonsProps {
  matchScore: number | undefined;
  hasResume: boolean;
  hasCoverLetter: boolean;
  onGenerateResume: () => Promise<void>;
  onGenerateCoverLetter: () => Promise<void>;
  onViewResume: () => void;
  onViewCoverLetter: () => void;
  compact?: boolean;
}

export function ArtifactGeneratorButtons({
  matchScore,
  hasResume,
  hasCoverLetter,
  onGenerateResume,
  onGenerateCoverLetter,
  onViewResume,
  onViewCoverLetter,
  compact = false,
}: ArtifactGeneratorButtonsProps) {
  const [generatingResume, setGeneratingResume] = useState(false);
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState(false);

  const isEligible = matchScore !== undefined && matchScore >= 60;

  const handleGenerateResume = async () => {
    if (hasResume) {
      onViewResume();
      return;
    }
    setGeneratingResume(true);
    try {
      await onGenerateResume();
    } finally {
      setGeneratingResume(false);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (hasCoverLetter) {
      onViewCoverLetter();
      return;
    }
    setGeneratingCoverLetter(true);
    try {
      await onGenerateCoverLetter();
    } finally {
      setGeneratingCoverLetter(false);
    }
  };

  const disabledTooltip = matchScore === undefined
    ? "Score the job first to generate artifacts"
    : `Score must be 60+ (currently ${matchScore})`;

  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!isEligible || generatingResume}
                onClick={handleGenerateResume}
              >
                {generatingResume ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : hasResume ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {!isEligible
                ? disabledTooltip
                : hasResume
                ? "View Tailored Resume"
                : "Generate Tailored Resume"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!isEligible || generatingCoverLetter}
                onClick={handleGenerateCoverLetter}
              >
                {generatingCoverLetter ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : hasCoverLetter ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {!isEligible
                ? disabledTooltip
                : hasCoverLetter
                ? "View Cover Letter"
                : "Generate Cover Letter"}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant={hasResume ? "secondary" : "outline"}
                size="sm"
                disabled={!isEligible || generatingResume}
                onClick={handleGenerateResume}
              >
                {generatingResume ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : hasResume ? (
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                {hasResume ? "View Resume" : "Tailor Resume"}
              </Button>
            </span>
          </TooltipTrigger>
          {!isEligible && (
            <TooltipContent>{disabledTooltip}</TooltipContent>
          )}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant={hasCoverLetter ? "secondary" : "outline"}
                size="sm"
                disabled={!isEligible || generatingCoverLetter}
                onClick={handleGenerateCoverLetter}
              >
                {generatingCoverLetter ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : hasCoverLetter ? (
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                {hasCoverLetter ? "View Letter" : "Cover Letter"}
              </Button>
            </span>
          </TooltipTrigger>
          {!isEligible && (
            <TooltipContent>{disabledTooltip}</TooltipContent>
          )}
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
