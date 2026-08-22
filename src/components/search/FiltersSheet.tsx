import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { SearchFiltersPanel } from "@/components/search/SearchFilters";
import type { SearchFilters } from "@/types/job";

interface FiltersSheetProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
}

/** Advanced filters live behind a sheet so the Inbox stays calm by default. */
export function FiltersSheet({ filters, onFiltersChange }: FiltersSheetProps) {
  const [open, setOpen] = useState(false);

  const activeCount = [
    filters.workType,
    filters.workArrangement,
    filters.salaryMin,
    filters.salaryMax,
    filters.datePosted,
  ].filter(Boolean).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" data-testid="open-filters">
          <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Advanced filters</SheetTitle>
          <SheetDescription>
            Applied the next time you run a search.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <SearchFiltersPanel filters={filters} onFiltersChange={onFiltersChange} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setOpen(false)}>Done</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
