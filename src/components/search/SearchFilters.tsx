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

const WORK_TYPES = [
  { value: "", label: "All work types" },
  { value: "full-time", label: "Full time" },
  { value: "part-time", label: "Part time" },
  { value: "contract", label: "Contract/Temp" },
  { value: "casual", label: "Casual/Vacation" },
];

const WORK_ARRANGEMENTS = [
  { value: "", label: "All remote options" },
  { value: "on-site", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

const SALARY_MIN_OPTIONS = [
  { value: "", label: "paying $0" },
  { value: "70000", label: "paying $70K" },
  { value: "80000", label: "paying $80K" },
  { value: "100000", label: "paying $100K" },
  { value: "120000", label: "paying $120K" },
  { value: "150000", label: "paying $150K" },
  { value: "200000", label: "paying $200K" },
  { value: "250000", label: "paying $250K" },
];

const SALARY_MAX_OPTIONS = [
  { value: "", label: "to $350K+" },
  { value: "70000", label: "to $70K" },
  { value: "80000", label: "to $80K" },
  { value: "100000", label: "to $100K" },
  { value: "120000", label: "to $120K" },
  { value: "150000", label: "to $150K" },
  { value: "200000", label: "to $200K" },
  { value: "250000", label: "to $250K" },
  { value: "350000", label: "to $350K" },
];

const SALARY_TYPE_OPTIONS = [
  { value: "annual", label: "Annually" },
  { value: "monthly", label: "Monthly" },
  { value: "hourly", label: "Hourly" },
];

const DATE_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "1", label: "Today" },
  { value: "3", label: "Last 3 days" },
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
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Work Type</Label>
        <Select
          value={filters.workType}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, workType: value })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="All work types" />
          </SelectTrigger>
          <SelectContent>
            {WORK_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value || "any"}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Remote Options</Label>
        <Select
          value={filters.workArrangement}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, workArrangement: value })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="All remote options" />
          </SelectTrigger>
          <SelectContent>
            {WORK_ARRANGEMENTS.map((option) => (
              <SelectItem key={option.value} value={option.value || "any"}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Min Salary</Label>
          <Select
            value={filters.salaryMin}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, salaryMin: value })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="paying $0" />
            </SelectTrigger>
            <SelectContent>
              {SALARY_MIN_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value || "any"}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Max Salary</Label>
          <Select
            value={filters.salaryMax}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, salaryMax: value })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="to $350K+" />
            </SelectTrigger>
            <SelectContent>
              {SALARY_MAX_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value || "any"}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Salary Type</Label>
        <Select
          value={filters.salaryType}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, salaryType: value })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Annually" />
          </SelectTrigger>
          <SelectContent>
            {SALARY_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Listed</Label>
        <Select
          value={filters.datePosted}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, datePosted: value })
          }
        >
          <SelectTrigger className="h-9">
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
        <Label className="text-xs text-muted-foreground mb-1.5 block">Jobs to Scrape</Label>
        <Select
          value={filters.jobLimit}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, jobLimit: value })
          }
        >
          <SelectTrigger className="h-9">
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
