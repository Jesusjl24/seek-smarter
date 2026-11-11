export type FilterReason = "below_salary" | "contract" | "industry" | "weak_fit";
export type FilterEvidence = { kind: string; text: string };
export type FilterResult = { reason: FilterReason | null; hits: string[]; humanReason: string | null; evidence: FilterEvidence[] };
const norm = (value: unknown) => String(value ?? "").toLowerCase().trim();
export function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("en-AU")}`;
}
export function parseSalaryFloor(raw?: string | null): number | null {
  if (!raw) return null;
  const values = [...raw.toLowerCase().replace(/,/g, "").matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*(k\b)?/g)]
    .map((m) => Number(m[1]) * (m[2] ? 1000 : 1)).filter((n) => Number.isFinite(n) && n >= 1000);
  return values.length ? Math.min(...values) : null;
}
function isContractOrTemp(job: any): boolean {
  const workType = norm(job.work_type).replace(/-/g, " ");
  if (/\b(contract|temp(?:orary)?|casual)\b/.test(workType) && !/full\s*time/.test(workType)) return true;
  const text = [job.title, job.description_snippet, job.full_description].map(norm).join(" ");
  return /\b(?:contract\/temp|fixed[\s-]?term(?:\s+contract)?|this is a (?:contract|temporary|casual) (?:role|position)|casual position|temporary contract)\b/.test(text);
}
export function deterministicFilter(job: any, prefs: any): FilterResult {
  const salary = parseSalaryFloor(job.salary_range);
  const listed = String(job.salary_range || "").trim();
  if (salary !== null && prefs?.salary_min && salary < Number(prefs.salary_min)) {
    const humanReason = listed
      ? `Dropped because the listed salary ${listed} sits below your ${formatMoney(Number(prefs.salary_min))} floor (the low end is ${formatMoney(salary)}).`
      : `Dropped because the listed salary sits below your ${formatMoney(Number(prefs.salary_min))} floor.`;
    return {
      reason: "below_salary",
      hits: [`Salary ${salary} is below ${prefs.salary_min}`],
      humanReason,
      evidence: [{ kind: "salary", text: listed || formatMoney(salary) }],
    };
  }
  if (isContractOrTemp(job)) {
    const workType = String(job.work_type || "").trim();
    return {
      reason: "contract",
      hits: ["Contract, temporary, or casual work"],
      humanReason: workType
        ? `Dropped because this listing is ${workType.toLowerCase()}, and your searches are for full-time roles.`
        : "Dropped because this listing looks like contract, temporary, or casual work, and your searches are for full-time roles.",
      evidence: [{ kind: "work_type", text: workType || "Contract, temporary, or casual wording in the listing" }],
    };
  }
  const blob = [job.company, job.title, job.description_snippet, job.full_description].map(norm).join(" ");
  const excluded = (prefs?.excluded_industries || []).find((item: string) => item && blob.includes(norm(item)));
  if (excluded) {
    return {
      reason: "industry",
      hits: [`Excluded industry: ${excluded}`],
      humanReason: `Dropped because it matches an industry you asked to skip (${excluded}).`,
      evidence: [{ kind: "industry", text: String(excluded) }],
    };
  }
  return { reason: null, hits: [], humanReason: null, evidence: [] };
}

export function evaluateDealbreakers(job: any, prefs: any) {
  const result = deterministicFilter(job, prefs); const hits = [...result.hits];
  if ((prefs?.excluded_titles || []).some((title: string) => norm(job.title).includes(norm(title)))) hits.push("Excluded title");
  return { hits, reason: result.reason };
}
