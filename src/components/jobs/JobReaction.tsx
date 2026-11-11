import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { isGuest } from "@/lib/guest";
import { sendJobFeedback } from "@/lib/api/briefings";

const LIKE_CHIPS = ["great fit", "right seniority", "good salary", "location", "interesting work"];
const DISLIKE_CHIPS = ["wrong industry", "too junior", "salary", "location", "not for me"];

export function JobReaction({
  jobId,
  current,
  onChanged,
}: {
  jobId: string;
  current?: "like" | "dislike" | null;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [choice, setChoice] = useState<"like" | "dislike" | null>(current || null);
  const [chips, setChips] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async (action: "like" | "dislike", nextChips = chips, nextNote = note) => {
    if (isGuest() || String(jobId).startsWith("demo")) {
      toast({ title: "Demo only", description: "Sign in to keep feedback." });
      return;
    }
    setSaving(true);
    try {
      await sendJobFeedback(jobId, action, nextChips[0] || nextNote || undefined, { chips: nextChips, note: nextNote || undefined });
      setChoice(action);
      toast({ title: action === "like" ? "Saved as a like" : "Saved as a dislike" });
      onChanged?.();
    } catch {
      toast({ title: "Could not save that reaction", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const pick = (action: "like" | "dislike") => {
    setChoice(action);
    setChips([]);
    setOpen(true);
    void save(action, [], "");
  };

  const toggleChip = (chip: string) => {
    const next = chips.includes(chip) ? chips.filter((item) => item !== chip) : [...chips, chip];
    setChips(next);
    if (choice) void save(choice, next, note);
  };

  const options = choice === "dislike" ? DISLIKE_CHIPS : LIKE_CHIPS;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Button type="button" variant={choice === "like" ? "default" : "ghost"} size="sm" className="min-h-11 px-3" aria-label="Like this role" aria-pressed={choice === "like"} disabled={saving} onClick={() => pick("like")}>
          <ThumbsUp className="h-4 w-4" />
        </Button>
        <Button type="button" variant={choice === "dislike" ? "default" : "ghost"} size="sm" className="min-h-11 px-3" aria-label="Dislike this role" aria-pressed={choice === "dislike"} disabled={saving} onClick={() => pick("dislike")}>
          <ThumbsDown className="h-4 w-4" />
        </Button>
      </div>
      {open && choice && (
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Optional: why? This helps the briefing learn what you prefer.</p>
          <div className="flex flex-wrap gap-2">
            {options.map((chip) => (
              <Button key={chip} type="button" size="sm" variant={chips.includes(chip) ? "default" : "outline"} className="h-8 rounded-full px-3 text-xs" onClick={() => toggleChip(chip)}>
                {chip}
              </Button>
            ))}
          </div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="A short note, if you want" className="min-h-[72px]" />
          {note.trim() && (
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => choice && save(choice, chips, note)}>
              Save note
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
