export type FilterReason = "below_salary" | "contract" | "industry" | "weak_fit";
const norm = (value: unknown) => String(value ?? "").toLowerCase().trim();
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
export function deterministicFilter(job: any, prefs: any): { reason: FilterReason | null; hits: string[] } {
  const salary = parseSalaryFloor(job.salary_range);
  if (salary !== null && prefs?.salary_min && salary < Number(prefs.salary_min)) return { reason: "below_salary", hits: [`Salary ${salary} is below ${prefs.salary_min}`] };
  if (isContractOrTemp(job)) return { reason: "contract", hits: ["Contract, temporary, or casual work"] };
  const text = [job.company, job.title, job.description_snippet, job.full_description].map(norm).join(" ");
  const excluded = (prefs?.excluded_industries || []).find((item: string) => item && text.includes(norm(item)));
  if (excluded) return { reason: "industry", hits: [`Excluded industry: ${excluded}`] };
  return { reason: null, hits: [] };
}
export function evaluateDealbreakers(job: any, prefs: any) {
  const result = deterministicFilter(job, prefs); const hits = [...result.hits];
  if ((prefs?.excluded_titles || []).some((title: string) => norm(job.title).includes(norm(title)))) hits.push("Excluded title");
  return { hits, reason: result.reason };
}
