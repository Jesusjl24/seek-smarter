import { Search, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  keywords: string;
  location: string;
  onKeywordsChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onSearch: () => void;
  isLoading: boolean;
}

export function SearchBar({
  keywords,
  location,
  onKeywordsChange,
  onLocationChange,
  onSearch,
  isLoading,
}: SearchBarProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Job title or keywords..."
          value={keywords}
          onChange={(e) => onKeywordsChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="relative flex-1 sm:max-w-xs">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Location..."
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Searching..." : "Search Jobs"}
      </Button>
    </form>
  );
}
