import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SearchFilters } from "@/types/job";

interface SearchFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
}

const WORK_TYPES = ["Full time", "Part time", "Contract", "Casual"];
const WORK_ARRANGEMENTS = ["On-site", "Hybrid", "Remote"];
const SALARY_OPTIONS = [
  { value: "", label: "Any" },
  { value: "50000", label: "$50k+" },
  { value: "60000", label: "$60k+" },
  { value: "70000", label: "$70k+" },
  { value: "80000", label: "$80k+" },
  { value: "100000", label: "$100k+" },
  { value: "120000", label: "$120k+" },
  { value: "150000", label: "$150k+" },
];
const DATE_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
];
const JOB_LIMIT_OPTIONS = [
  { value: "10", label: "10 jobs" },
  { value: "20", label: "20 jobs" },
  { value: "30", label: "30 jobs" },
  { value: "50", label: "50 jobs" },
];

export function SearchFiltersPanel({
  filters,
  onFiltersChange,
}: SearchFiltersProps) {
  const toggleWorkType = (type: string) => {
    const newTypes = filters.workTypes.includes(type)
      ? filters.workTypes.filter((t) => t !== type)
      : [...filters.workTypes, type];
    onFiltersChange({ ...filters, workTypes: newTypes });
  };

  const toggleWorkArrangement = (arrangement: string) => {
    const newArrangements = filters.workArrangements.includes(arrangement)
      ? filters.workArrangements.filter((a) => a !== arrangement)
      : [...filters.workArrangements, arrangement];
    onFiltersChange({ ...filters, workArrangements: newArrangements });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3 text-sm">Work Type</h3>
        <div className="space-y-2">
          {WORK_TYPES.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <Checkbox
                id={`work-type-${type}`}
                checked={filters.workTypes.includes(type)}
                onCheckedChange={() => toggleWorkType(type)}
              />
              <Label
                htmlFor={`work-type-${type}`}
                className="text-sm font-normal cursor-pointer"
              >
                {type}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3 text-sm">Work Arrangement</h3>
        <div className="space-y-2">
          {WORK_ARRANGEMENTS.map((arrangement) => (
            <div key={arrangement} className="flex items-center gap-2">
              <Checkbox
                id={`arrangement-${arrangement}`}
                checked={filters.workArrangements.includes(arrangement)}
                onCheckedChange={() => toggleWorkArrangement(arrangement)}
              />
              <Label
                htmlFor={`arrangement-${arrangement}`}
                className="text-sm font-normal cursor-pointer"
              >
                {arrangement}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3 text-sm">Minimum Salary</h3>
        <Select
          value={filters.minSalary}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, minSalary: value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            {SALARY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value || "any"}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <h3 className="font-semibold mb-3 text-sm">Date Posted</h3>
        <Select
          value={filters.datePosted}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, datePosted: value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Any time" />
          </SelectTrigger>
          <SelectContent>
            {DATE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value || "any"}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <h3 className="font-semibold mb-3 text-sm">Jobs to Scrape</h3>
        <Select
          value={filters.jobLimit || "20"}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, jobLimit: value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="20 jobs" />
          </SelectTrigger>
          <SelectContent>
            {JOB_LIMIT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
