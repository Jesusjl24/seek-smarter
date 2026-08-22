import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Plus } from "lucide-react";
import {
  WORK_ARRANGEMENT_OPTIONS,
  WORK_TYPE_OPTIONS,
  type CandidatePreferences,
} from "@/types/preferences";
import { isValidPolicy } from "@/lib/policy";

interface Props {
  value: CandidatePreferences;
  onChange: (next: CandidatePreferences) => void;
  onSave: () => void;
  saving: boolean;
}

function ChipInput({
  label,
  help,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  help?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" size="icon" onClick={add} aria-label={`Add ${label}`}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1 pr-1">
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                className="rounded-sm p-0.5 hover:bg-muted"
                onClick={() => onChange(values.filter((x) => x !== v))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function PreferencesForm({ value, onChange, onSave, saving }: Props) {
  const set = <K extends keyof CandidatePreferences>(key: K, v: CandidatePreferences[K]) =>
    onChange({ ...value, [key]: v });

  const policyValid = isValidPolicy(value);

  const toggleIn = (list: string[], item: string) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Goals and direction</CardTitle>
          <CardDescription>
            What the assistant should optimise for when it reviews a role.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job_goals">Job goals</Label>
            <Textarea
              id="job_goals"
              rows={3}
              placeholder="e.g. Senior IC role on a product team, more ownership of the frontend platform."
              value={value.job_goals ?? ""}
              onChange={(e) => set("job_goals", e.target.value || null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="career_direction">Career direction</Label>
            <Textarea
              id="career_direction"
              rows={3}
              placeholder="e.g. Staying hands-on for two more years, then moving toward staff-level scope."
              value={value.career_direction ?? ""}
              onChange={(e) => set("career_direction", e.target.value || null)}
            />
          </div>
          <ChipInput
            label="Target titles"
            values={value.target_titles}
            onChange={(v) => set("target_titles", v)}
            placeholder="Senior Product Engineer"
          />
          <ChipInput
            label="Target industries"
            values={value.target_industries}
            onChange={(v) => set("target_industries", v)}
            placeholder="SaaS"
          />
          <div className="space-y-2">
            <Label htmlFor="verified_experience">Verified experience</Label>
            <p className="text-xs text-muted-foreground">
              Claims you can back up in an interview. The assistant will not invent anything beyond this.
            </p>
            <Textarea
              id="verified_experience"
              rows={4}
              placeholder="e.g. Led two 0→1 SaaS launches; 8 years TypeScript; managed a team of 4."
              value={value.verified_experience ?? ""}
              onChange={(e) => set("verified_experience", e.target.value || null)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compensation and logistics</CardTitle>
          <CardDescription>Used for deterministic dealbreaker checks before any AI reasoning.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="salary_min">Minimum salary</Label>
              <Input
                id="salary_min"
                type="number"
                inputMode="numeric"
                placeholder="150000"
                value={value.salary_min ?? ""}
                onChange={(e) =>
                  set("salary_min", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salary_target">Target salary</Label>
              <Input
                id="salary_target"
                type="number"
                inputMode="numeric"
                placeholder="185000"
                value={value.salary_target ?? ""}
                onChange={(e) =>
                  set("salary_target", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={value.currency}
                onChange={(e) => set("currency", e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <ChipInput
            label="Acceptable locations"
            help="Leave empty to accept anywhere. Remote roles pass if Remote is accepted below."
            values={value.locations}
            onChange={(v) => set("locations", v)}
            placeholder="Sydney"
          />

          <div className="space-y-2">
            <Label>Work arrangements</Label>
            <div className="flex flex-wrap gap-4 pt-1">
              {WORK_ARRANGEMENT_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={value.work_arrangements.includes(opt)}
                    onCheckedChange={() =>
                      set("work_arrangements", toggleIn(value.work_arrangements, opt))
                    }
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Employment types</Label>
            <div className="flex flex-wrap gap-4 pt-1">
              {WORK_TYPE_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={value.work_types.includes(opt)}
                    onCheckedChange={() => set("work_types", toggleIn(value.work_types, opt))}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dealbreakers</CardTitle>
          <CardDescription>
            Checked deterministically. A hit is reported and pushes the role into Deprioritise — it never
            moves the job on its own.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChipInput
            label="Excluded roles"
            help="If the job title contains one of these, it is flagged."
            values={value.excluded_titles}
            onChange={(v) => set("excluded_titles", v)}
            placeholder="Salesforce Admin"
          />
          <ChipInput
            label="Required qualifications"
            help="Flagged when the listing does not mention them."
            values={value.mandatory_qualifications}
            onChange={(v) => set("mandatory_qualifications", v)}
            placeholder="Australian work rights"
          />
          <ChipInput
            label="Dealbreaker keywords"
            help="Flagged when the listing mentions them."
            values={value.dealbreakers}
            onChange={(v) => set("dealbreakers", v)}
            placeholder="on-call rotation"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Score policy</CardTitle>
          <CardDescription>
            Thresholds used everywhere a recommendation is shown. Scoring never changes a job's status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="policy_strong">Strong Apply at or above</Label>
              <Input
                id="policy_strong"
                type="number"
                min={1}
                max={100}
                value={value.policy_strong}
                onChange={(e) => set("policy_strong", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy_review">Review at or above</Label>
              <Input
                id="policy_review"
                type="number"
                min={0}
                max={100}
                value={value.policy_review}
                onChange={(e) => set("policy_review", Number(e.target.value))}
              />
            </div>
          </div>
          {!policyValid && (
            <p className="text-sm text-destructive">
              Thresholds must satisfy 0 ≤ Review &lt; Strong Apply ≤ 100.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {value.policy_strong}–100 Strong Apply · {value.policy_review}–
            {Math.max(value.policy_review, value.policy_strong - 1)} Review · 0–
            {Math.max(0, value.policy_review - 1)} Deprioritise
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving || !policyValid}>
          {saving ? "Saving…" : "Save career profile"}
        </Button>
      </div>
    </div>
  );
}
