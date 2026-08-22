import { useEffect, useState } from "react";
import { PreferencesForm } from "@/components/preferences/PreferencesForm";
import { fetchPreferences, savePreferences } from "@/lib/api/preferences";
import { EMPTY_PREFERENCES, type CandidatePreferences } from "@/types/preferences";
import { useToast } from "@/hooks/use-toast";
import { isGuest } from "@/lib/guest";
import { Loader2 } from "lucide-react";

const Settings = () => {
  const [prefs, setPrefs] = useState<CandidatePreferences>(EMPTY_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPreferences()
      .then(setPrefs)
      .catch((e) => {
        console.error(e);
        toast({
          title: "Could not load your career profile",
          description: e instanceof Error ? e.message : undefined,
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await savePreferences(prefs);
      setPrefs(saved);
      toast({
        title: "Career profile saved",
        description: isGuest()
          ? "Stored locally for this demo session."
          : "Scoring and document generation will use these preferences.",
      });
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">Career profile</h1>
        <p className="text-muted-foreground">
          Goals, constraints, and the score policy the assistant applies to every role.
        </p>
      </div>
      <PreferencesForm value={prefs} onChange={setPrefs} onSave={handleSave} saving={saving} />
    </div>
  );
};

export default Settings;
