import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { isGuest } from "@/lib/guest";
import { fetchLearnedPreferences, resetLearnedPreferences, saveLearnedPreferences, type LearnedPreferences } from "@/lib/api/learnedPreferences";

export function LearnedPreferencesPanel({ compact = false }: { compact?: boolean }) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<LearnedPreferences | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (isGuest()) { setProfile({ memo_text: "", generated_memo: "", like_summary: "", avoid_summary: "" }); return; }
    fetchLearnedPreferences().then((body) => { setProfile(body); setDraft(body.memo_text || ""); }).catch(() => setProfile({ memo_text: "", generated_memo: "", like_summary: "", avoid_summary: "" }));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveLearnedPreferences(draft);
      setProfile(saved);
      setEditing(false);
      toast({ title: "Saved your preference note" });
    } catch {
      toast({ title: "Could not save that note", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (isGuest()) return;
    setSaving(true);
    try {
      const saved = await resetLearnedPreferences();
      setProfile(saved);
      setDraft(saved.memo_text || "");
      setEditing(false);
      toast({ title: "Reset to what the app has learned" });
    } catch {
      toast({ title: "Could not reset that note", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;
  const memo = profile.memo_text || "";

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">What I've learned about you</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {editing ? (
          <>
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[120px]" placeholder="What you like, and what you would rather avoid." />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="min-h-11" disabled={saving} onClick={save}>Save</Button>
              <Button size="sm" variant="ghost" className="min-h-11" onClick={() => { setEditing(false); setDraft(memo); }}>Cancel</Button>
            </div>
          </>
        ) : memo ? (
          <p className="whitespace-pre-wrap text-sm leading-6">{memo}</p>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            I haven't learned your likes and dislikes yet. Use the thumbs on a job and I'll start building a short note here.
          </p>
        )}
        {!editing && !isGuest() && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="min-h-11" onClick={() => { setDraft(memo); setEditing(true); }}>Edit</Button>
            <Button size="sm" variant="ghost" className="min-h-11" disabled={saving || !memo} onClick={reset}>Reset</Button>
            {compact && <Link className="self-center text-sm text-primary hover:underline" to="/settings">Open in settings</Link>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
