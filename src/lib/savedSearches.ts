// Saved search profiles — a compact replacement for the old "Jobs to Scrape" control.
// Stored locally so guest mode behaves identically to a signed-in session.

import type { SearchFilters } from "@/types/job";

const KEY = "seek-smarter:saved-searches";

export interface SavedSearch {
  id: string;
  name: string;
  filters: SearchFilters;
}

export function loadSavedSearches(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedSearch[]) : [];
  } catch {
    return [];
  }
}

function persist(list: SavedSearch[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — saved searches are a convenience, not a requirement
  }
}

export function saveSearch(name: string, filters: SearchFilters): SavedSearch[] {
  const trimmed = name.trim() || `${filters.keywords || "Search"} · ${filters.location || "Anywhere"}`;
  const list = loadSavedSearches().filter((s) => s.name !== trimmed);
  const next = [{ id: `${Date.now()}`, name: trimmed, filters }, ...list].slice(0, 8);
  persist(next);
  return next;
}

export function removeSavedSearch(id: string): SavedSearch[] {
  const next = loadSavedSearches().filter((s) => s.id !== id);
  persist(next);
  return next;
}

export function describeSearch(filters: SearchFilters): string {
  const parts = [filters.keywords || "Any role", filters.location || "Anywhere"];
  if (filters.workType) parts.push(filters.workType);
  if (filters.workArrangement) parts.push(filters.workArrangement);
  return parts.join(" · ");
}
