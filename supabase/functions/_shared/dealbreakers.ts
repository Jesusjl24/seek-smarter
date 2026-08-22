// Mirror of src/lib/dealbreakers.ts — keep both in sync.

export interface CandidatePreferences {
  job_goals?: string | null;
  career_direction?: string | null;
  target_titles?: string[];
  target_industries?: string[];
  excluded_titles?: string[];
  salary_min?: number | null;
  salary_target?: number | null;
  currency?: string;
  locations?: string[];
  work_arrangements?: string[];
  work_types?: string[];
  mandatory_qualifications?: string[];
  dealbreakers?: string[];
  verified_experience?: string | null;
  policy_strong?: number;
  policy_review?: number;
}


export interface DealbreakerJobInput {
  title: string;
  company?: string;
  location?: string | null;
  salary_range?: string | null;
  work_type?: string | null;
  work_arrangement?: string | null;
  description_snippet?: string | null;
  full_description?: string | null;
}

const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().trim();

/**
 * Pulls the lowest annual figure out of a free-text SEEK salary range.
 * Returns null when nothing parseable is present — we never guess.
 */
export function parseSalaryFloor(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/,/g, "");
  const matches = [...text.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*(k\b)?/g)];
  const values: number[] = [];
  for (const m of matches) {
    let n = parseFloat(m[1]);
    if (!Number.isFinite(n)) continue;
    if (m[2]) n *= 1000;
    // Ignore obviously non-salary numbers (hourly rates, years, page noise).
    if (n < 1000) continue;
    values.push(n);
  }
  if (values.length === 0) return null;
  return Math.min(...values);
}

export function evaluateDealbreakers(
  job: DealbreakerJobInput,
  prefs: CandidatePreferences | null | undefined
): string[] {
  if (!prefs) return [];
  const hits: string[] = [];
  const title = norm(job.title);
  const haystack = [
    norm(job.title),
    norm(job.description_snippet),
    norm(job.full_description),
  ].join(" \n ");

  // 1. Salary floor
  if (prefs.salary_min && prefs.salary_min > 0) {
    const floor = parseSalaryFloor(job.salary_range);
    if (floor !== null && floor < prefs.salary_min) {
      hits.push(
        `Salary floor ${job.salary_range} is below your minimum of ${prefs.currency ?? "AUD"} ${prefs.salary_min.toLocaleString()}`
      );
    }
  }

  // 2. Location
  if ((prefs.locations ?? []).length > 0) {
    const loc = norm(job.location);
    const arrangement = norm(job.work_arrangement);
    const remoteOk =
      (prefs.work_arrangements ?? []).some((a) => norm(a) === "remote") &&
      arrangement.includes("remote");
    const matched =
      loc.length === 0 ||
      remoteOk ||
      (prefs.locations ?? []).some((l) => {
        const target = norm(l);
        return target.length > 0 && (loc.includes(target) || target.includes(loc));
      });
    if (!matched) {
      hits.push(`Location "${job.location}" is outside your preferred locations`);
    }
  }

  // 3. Work arrangement
  if ((prefs.work_arrangements ?? []).length > 0 && job.work_arrangement) {
    const arrangement = norm(job.work_arrangement);
    const matched = (prefs.work_arrangements ?? []).some((a) => arrangement.includes(norm(a)));
    if (!matched) {
      hits.push(`Work arrangement "${job.work_arrangement}" is not one you accept`);
    }
  }

  // 4. Employment type
  if ((prefs.work_types ?? []).length > 0 && job.work_type) {
    const wt = norm(job.work_type).replace(/-/g, " ");
    const matched = (prefs.work_types ?? []).some((t) =>
      wt.includes(norm(t).replace(/-/g, " "))
    );
    if (!matched) {
      hits.push(`Employment type "${job.work_type}" is not one you accept`);
    }
  }

  // 5. Excluded roles / titles
  for (const excluded of (prefs.excluded_titles ?? [])) {
    const term = norm(excluded);
    if (term && title.includes(term)) {
      hits.push(`Title matches your excluded role "${excluded}"`);
    }
  }

  // 6. Mandatory qualifications the user marked as required
  for (const q of (prefs.mandatory_qualifications ?? [])) {
    const term = norm(q);
    if (term && !haystack.includes(term)) {
      hits.push(`Listing does not mention your required qualification "${q}"`);
    }
  }

  // 7. Free-text dealbreaker keywords
  for (const d of (prefs.dealbreakers ?? [])) {
    const term = norm(d);
    if (term && haystack.includes(term)) {
      hits.push(`Listing mentions your dealbreaker "${d}"`);
    }
  }

  return hits;
}
