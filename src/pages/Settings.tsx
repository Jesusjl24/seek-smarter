import { useEffect, useState } from "react";
import { PreferencesForm } from "@/components/preferences/PreferencesForm";
import { fetchPreferences, savePreferences } from "@/lib/api/preferences";
import { EMPTY_PREFERENCES, type CandidatePreferences } from "@/types/preferences";
import { useToast } from "@/hooks/use-toast";
import { isGuest } from "@/lib/guest";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createSearchProfile, fetchSearchProfiles, setSearchProfileActive } from "@/lib/api/pipeline";
import { runSavedSearchesNow } from "@/lib/api/pipeline";
import { apiGet, apiPut } from "@/lib/api/client";
import type { SearchProfile } from "@/types/assistant";

const Settings = () => {
  const [prefs, setPrefs] = useState<CandidatePreferences>(EMPTY_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [draft, setDraft] = useState({ name: "", titles: "", locations: "", salary: "" });
  const [schedule, setSchedule] = useState({ pipeline_cron: "0 6 * * *", pipeline_timezone: "Australia/Sydney" });
  const [running, setRunning] = useState(false);

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
  useEffect(() => { if (!isGuest()) fetchSearchProfiles().then(setProfiles).catch(console.error); }, []);
  useEffect(() => { if (!isGuest()) apiGet<typeof schedule>("/api/settings/schedule").then(setSchedule).catch(console.error); }, []);

  const addProfile = async () => {
    if (!draft.name.trim() || !draft.titles.trim()) return;
    try {
      const created = await createSearchProfile({ name: draft.name.trim(), target_titles: draft.titles.split(",").map((x) => x.trim()).filter(Boolean), locations: draft.locations.split(",").map((x) => x.trim()).filter(Boolean), salary_min: draft.salary ? Number(draft.salary) : null });
      setProfiles((current) => [...current, created]); setDraft({ name: "", titles: "", locations: "", salary: "" });
    } catch (e) { toast({ title: "Could not create saved search", variant: "destructive" }); }
  };

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
      {!isGuest() && <section className="space-y-4 rounded-lg border p-4"><div><h2 className="font-semibold">Saved searches</h2><p className="text-sm text-muted-foreground">Active searches run on the job-agent schedule.</p></div><div className="grid gap-2 sm:grid-cols-2"><Input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}/><Input placeholder="Target titles, comma separated" value={draft.titles} onChange={(e) => setDraft({ ...draft, titles: e.target.value })}/><Input placeholder="Locations, comma separated" value={draft.locations} onChange={(e) => setDraft({ ...draft, locations: e.target.value })}/><Input type="number" placeholder="Minimum salary" value={draft.salary} onChange={(e) => setDraft({ ...draft, salary: e.target.value })}/></div><Button size="sm" onClick={addProfile}><Plus className="mr-1 h-4 w-4"/>Add saved search</Button><div className="divide-y">{profiles.map((profile) => <div key={profile.id} className="flex items-center justify-between py-3"><div><p className="text-sm font-medium">{profile.name}</p><p className="text-xs text-muted-foreground">{profile.target_titles.join(", ")} · {profile.locations.join(", ") || "Any location"}</p></div><Switch checked={profile.active} onCheckedChange={async (active) => { await setSearchProfileActive(profile.id, active); setProfiles((items) => items.map((p) => p.id === profile.id ? { ...p, active } : p)); }}/></div>)}</div></section>}
      {!isGuest() && <section className="space-y-4 rounded-lg border p-4"><div><h2 className="font-semibold">Daily briefing schedule</h2><p className="text-sm text-muted-foreground">Saved searches run automatically at this time. Changes apply immediately.</p></div><div className="grid gap-3 sm:grid-cols-2"><Input aria-label="Cron expression" value={schedule.pipeline_cron} onChange={e=>setSchedule({...schedule,pipeline_cron:e.target.value})}/><Input aria-label="Timezone" value={schedule.pipeline_timezone} onChange={e=>setSchedule({...schedule,pipeline_timezone:e.target.value})}/></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={async()=>{await apiPut("/api/settings/schedule",schedule);toast({title:"Schedule saved"})}}>Save schedule</Button><Button size="sm" variant="ghost" disabled={running} onClick={async()=>{setRunning(true);try{await runSavedSearchesNow();toast({title:"Briefing run complete"})}finally{setRunning(false)}}}>{running?"Running…":"Run now"}</Button></div></section>}
    </div>
  );
};

export default Settings;
