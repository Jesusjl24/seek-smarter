import { useEffect, useState } from "react";
import { Bookmark, Play, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FiltersSheet } from "./FiltersSheet";
import {
  loadSavedSearches,
  removeSavedSearch,
  saveSearch,
  describeSearch,
  type SavedSearch,
} from "@/lib/savedSearches";
import type { SearchFilters } from "@/types/job";

interface SearchSourceBarProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  onSearch: () => void;
  isSearching: boolean;
}

const LIMITS = ["10", "20", "30", "50"];

/**
 * Compact search-source control: keywords + location + saved search profiles,
 * with everything else tucked into the filters sheet.
 */
export function SearchSourceBar({
  filters,
  onFiltersChange,
  onSearch,
  isSearching,
}: SearchSourceBarProps) {
  const [saved, setSaved] = useState<SavedSearch[]>([]);

  useEffect(() => {
    setSaved(loadSavedSearches());
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch();
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3 sm:p-4" data-testid="search-source">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Job title or keywords"
            placeholder="Job title or keywords"
            value={filters.keywords}
            onChange={(e) => onFiltersChange({ ...filters, keywords: e.target.value })}
            className="pl-9"
          />
        </div>
        <Input
          aria-label="Location"
          placeholder="Location"
          value={filters.location}
          onChange={(e) => onFiltersChange({ ...filters, location: e.target.value })}
          className="sm:max-w-[200px]"
        />
        <Select
          value={filters.jobLimit}
          onValueChange={(jobLimit) => onFiltersChange({ ...filters, jobLimit })}
        >
          <SelectTrigger className="sm:w-[130px]" aria-label="Results per search">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIMITS.map((l) => (
              <SelectItem key={l} value={l}>
                {l} results
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <FiltersSheet filters={filters} onFiltersChange={onFiltersChange} />
          <Button type="submit" disabled={isSearching} className="flex-1 sm:flex-none">
            {isSearching ? "Searching…" : "Search"}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Saved searches</span>
        {saved.length === 0 && (
          <span className="text-muted-foreground/70">None yet</span>
        )}
        {saved.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1 rounded-md border bg-muted/40 pl-2"
          >
            <button
              type="button"
              className="py-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              onClick={() => onFiltersChange(s.filters)}
              title={describeSearch(s.filters)}
            >
              <Play className="mr-1 inline h-3 w-3" aria-hidden />
              {s.name}
            </button>
            <button
              type="button"
              aria-label={`Remove saved search ${s.name}`}
              className="px-1.5 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              onClick={() => setSaved(removeSavedSearch(s.id))}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 text-xs"
          disabled={!filters.keywords.trim()}
          onClick={() => setSaved(saveSearch(describeSearch(filters), filters))}
        >
          <Bookmark className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Save this search
        </Button>
      </div>
    </div>
  );
}
