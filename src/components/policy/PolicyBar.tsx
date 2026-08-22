import { useState } from "react";
import { Link } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DEFAULT_POLICY, type ScorePolicy } from "@/types/preferences";
import { isValidPolicy } from "@/lib/policy";

interface PolicyBarProps {
  policy: ScorePolicy;
  onChange?: (policy: ScorePolicy) => void;
  /** Compact variant drops the explanatory line. */
  compact?: boolean;
}

/**
 * Makes the scoring policy visible everywhere it matters, and editable in place
 * rather than buried in code.
 */
export function PolicyBar({ policy, onChange, compact = false }: PolicyBarProps) {
  const [draft, setDraft] = useState<ScorePolicy>(policy);
  const [open, setOpen] = useState(false);
  const valid = isValidPolicy(draft);

  const apply = () => {
    if (!valid || !onChange) return;
    onChange(draft);
    setOpen(false);
  };

  return (
    <div
      data-testid="policy-bar"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-2 text-xs"
    >
      <span className="font-medium text-foreground">Scoring policy</span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
        {policy.policy_strong}+ Strong Apply
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-warning" aria-hidden />
        {policy.policy_review}–{policy.policy_strong - 1} Review
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/50" aria-hidden />
        Below {policy.policy_review} Deprioritise
      </span>

      <div className="ml-auto flex items-center gap-2">
        {onChange ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="policy-edit">
                <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                Adjust
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="policy-strong" className="text-xs">
                  Strong Apply at or above
                </Label>
                <Input
                  id="policy-strong"
                  type="number"
                  min={1}
                  max={100}
                  value={draft.policy_strong}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, policy_strong: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="policy-review" className="text-xs">
                  Review at or above
                </Label>
                <Input
                  id="policy-review"
                  type="number"
                  min={0}
                  max={100}
                  value={draft.policy_review}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, policy_review: Number(e.target.value) }))
                  }
                />
              </div>
              {!valid && (
                <p className="text-xs text-destructive">
                  Review must be lower than Strong Apply, and both between 0 and 100.
                </p>
              )}
              <div className="flex justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft({ ...DEFAULT_POLICY })}
                >
                  Reset
                </Button>
                <Button size="sm" onClick={apply} disabled={!valid}>
                  Save policy
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link to="/settings">Edit in Career Profile</Link>
          </Button>
        )}
      </div>

      {!compact && (
        <p className="w-full text-muted-foreground">
          Bands are applied to every score in the app. Changing them re-labels existing
          matches — it does not re-run the assistant.
        </p>
      )}
    </div>
  );
}
