// Guest / demo mode: local, in-memory sample data. No live API calls.
import type {
  JobWithMatch,
  JobMatch,
  PipelineStatus,
  PipelineCounts,
  ResumeProfile,
  JobArtifact,
  TailoredResume,
  CoverLetter,
  ScrapedJob,
} from "@/types/job";
import { EMPTY_PREFERENCES, type CandidatePreferences } from "@/types/preferences";
import { evaluateDealbreakers } from "@/lib/dealbreakers";
import { bandLabel } from "@/lib/policy";

const KEY = "seek-smarter:guest";

export function isGuest(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function enableGuest() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // ignore
  }
  // Reset store so each demo session starts fresh
  store = null;
}

export function exitGuest() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  store = null;
}

// ---- In-memory demo store ----
interface GuestStore {
  jobs: JobWithMatch[];
  profile: ResumeProfile;
  artifacts: Map<string, JobArtifact[]>;
}

let store: GuestStore | null = null;

function nowIso() {
  return new Date().toISOString();
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function seed(): GuestStore {
  const profile: ResumeProfile = {
    id: "demo-profile",
    raw_text:
      "Senior product engineer with 8 years shipping SaaS. Strong TypeScript, React, Node, Postgres. Led two 0→1 products.",
    skills_technical: [
      "TypeScript",
      "React",
      "Node.js",
      "PostgreSQL",
      "AWS",
      "Python",
      "GraphQL",
      "Docker",
    ],
    skills_soft: ["Leadership", "Communication", "Mentoring", "Product thinking"],
    years_experience: 8,
    education: ["B.Sc. Computer Science, University of Sydney"],
    certifications: ["AWS Solutions Architect Associate"],
    previous_titles: ["Senior Software Engineer", "Full Stack Engineer", "Product Engineer"],
    industries: ["SaaS", "Fintech", "Consumer"],
    summary:
      "Product-minded senior engineer who ships. Comfortable across the stack, most fluent in TypeScript + React + Node.",
    updated_at: nowIso(),
    file_name: "demo_resume.pdf",
    file_type: "application/pdf",
    file_url: null,
  };

  const mk = (
    i: number,
    partial: Partial<JobWithMatch>,
    match?: Partial<JobMatch>
  ): JobWithMatch => {
    const id = `demo-${i}`;
    const base: JobWithMatch = {
      id,
      seek_job_id: `9000${i}`,
      title: partial.title ?? `Role ${i}`,
      company: partial.company ?? `Company ${i}`,
      location: partial.location ?? "Sydney NSW",
      salary_range: partial.salary_range ?? null,
      work_type: partial.work_type ?? "Full time",
      work_arrangement: partial.work_arrangement ?? "Hybrid",
      description_snippet:
        partial.description_snippet ??
        "Join a fast-moving team building modern web products. TypeScript, React, and cloud experience valued.",
      full_description: partial.full_description ?? null,
      job_url: `https://www.seek.com.au/job/9000${i}`,
      date_posted: partial.date_posted ?? daysAgoIso(i),
      date_scraped: nowIso(),
      pipeline_status: partial.pipeline_status ?? "inbox",
      notes: partial.notes ?? null,
      updated_at: nowIso(),
    };
    if (match) {
      base.match = {
        id: `demo-match-${i}`,
        job_id: id,
        resume_profile_id: profile.id,
        match_score: match.match_score ?? 75,
        skill_match_percentage: match.skill_match_percentage ?? 80,
        recommendation: match.recommendation ?? "Apply",
        reasoning: match.reasoning ?? "Strong alignment on core stack.",
        pros: match.pros ?? ["TypeScript + React match", "Seniority aligned"],
        cons: match.cons ?? ["Limited fintech experience"],
        gaps: match.gaps ?? ["No formal FinTech background"],
        strategic_advice:
          match.strategic_advice ?? "Lead with the two 0→1 SaaS launches in the summary.",
        scored_at: nowIso(),
        agent: "job_match_scorer",
        agent_version: "1.0",
      };
    }
    return base;
  };

  const jobs: JobWithMatch[] = [
    mk(1, {
      title: "Senior Product Engineer",
      company: "Canva",
      location: "Sydney NSW",
      salary_range: "$180k – $220k",
      work_arrangement: "Hybrid",
    }),
    mk(2, {
      title: "Staff Frontend Engineer",
      company: "Atlassian",
      location: "Sydney NSW",
      salary_range: "$200k – $240k",
    }),
    mk(3, {
      title: "Full Stack Engineer",
      company: "Culture Amp",
      location: "Melbourne VIC",
      salary_range: "$150k – $180k",
      work_arrangement: "Remote",
    }),
    mk(4, {
      title: "Engineering Manager",
      company: "SafetyCulture",
      location: "Sydney NSW",
      salary_range: "$220k – $260k",
    }),
    mk(5, {
      title: "Backend Engineer (Go)",
      company: "Airwallex",
      location: "Melbourne VIC",
    }),
    mk(
      6,
      {
        title: "Senior React Engineer",
        company: "Linktree",
        location: "Melbourne VIC",
        salary_range: "$170k – $200k",
        pipeline_status: "shortlist",
      },
      { match_score: 88, recommendation: "Strong Apply" }
    ),
    mk(
      7,
      {
        title: "Lead Frontend Engineer",
        company: "Employment Hero",
        location: "Sydney NSW",
        pipeline_status: "shortlist",
      },
      { match_score: 82, recommendation: "Apply" }
    ),
    mk(
      8,
      {
        title: "Junior QA Analyst",
        company: "Local Startup",
        location: "Sydney NSW",
        pipeline_status: "not_fit",
      },
      { match_score: 34, recommendation: "Skip" }
    ),
    mk(
      9,
      {
        title: "Salesforce Admin",
        company: "Enterprise Co",
        location: "Sydney NSW",
        pipeline_status: "not_fit",
      },
      { match_score: 22, recommendation: "Skip" }
    ),
  ];

  return { jobs, profile, artifacts: new Map() };
}

function getStore(): GuestStore {
  if (!store) store = seed();
  return store;
}

// ---- Read/write helpers used by API layer ----

export function guestFetchProfile(): ResumeProfile {
  return getStore().profile;
}

export function guestDeleteProfile() {
  const s = getStore();
  s.profile = { ...s.profile, id: "" };
}

export function guestFetchJobsByStatus(
  status: PipelineStatus | PipelineStatus[]
): JobWithMatch[] {
  const statuses = Array.isArray(status) ? status : [status];
  return getStore().jobs.filter((j) => statuses.includes(j.pipeline_status));
}

export function guestFetchAllJobs(): JobWithMatch[] {
  return getStore().jobs;
}

export function guestCounts(): PipelineCounts {
  const c: PipelineCounts = {
    inbox: 0,
    shortlist: 0,
    not_fit: 0,
    applied: 0,
    interview: 0,
    offer: 0,
  };
  for (const j of getStore().jobs) {
    const s = j.pipeline_status;
    if (s === "inbox") c.inbox++;
    else if (s === "shortlist") c.shortlist++;
    else if (s === "not_fit" || s === "rejected" || s === "withdrawn") c.not_fit++;
    else if (s === "applied" || s === "screening") c.applied++;
    else if (s === "interview" || s === "final_interview") c.interview++;
    else if (s === "offer") c.offer++;
  }
  return c;
}

export function guestUpdateStatus(id: string, status: PipelineStatus) {
  const s = getStore();
  s.jobs = s.jobs.map((j) => (j.id === id ? { ...j, pipeline_status: status, updated_at: nowIso() } : j));
}

export function guestBulkUpdateStatus(ids: string[], status: PipelineStatus) {
  const s = getStore();
  const set = new Set(ids);
  s.jobs = s.jobs.map((j) =>
    set.has(j.id) ? { ...j, pipeline_status: status, updated_at: nowIso() } : j
  );
}

export function guestUpdateNotes(id: string, notes: string) {
  const s = getStore();
  s.jobs = s.jobs.map((j) => (j.id === id ? { ...j, notes } : j));
}

export function guestDelete(id: string) {
  const s = getStore();
  s.jobs = s.jobs.filter((j) => j.id !== id);
}

export function guestDeleteMany(ids: string[]) {
  const s = getStore();
  const set = new Set(ids);
  s.jobs = s.jobs.filter((j) => !set.has(j.id));
}

export function guestUpsertScraped(scraped: ScrapedJob[]) {
  const s = getStore();
  let newCount = 0;
  for (const j of scraped) {
    if (s.jobs.some((x) => x.seek_job_id === j.seek_job_id)) continue;
    s.jobs.unshift({
      id: `demo-${Date.now()}-${newCount}`,
      seek_job_id: j.seek_job_id,
      title: j.title,
      company: j.company,
      location: j.location,
      salary_range: j.salary_range ?? null,
      work_type: j.work_type ?? null,
      work_arrangement: j.work_arrangement ?? null,
      description_snippet: j.description_snippet,
      full_description: j.full_description ?? null,
      job_url: j.job_url,
      date_posted: j.date_posted ?? null,
      date_scraped: nowIso(),
      pipeline_status: "inbox",
      notes: null,
      updated_at: nowIso(),
    });
    newCount++;
  }
  return { newCount, existingCount: scraped.length - newCount };
}

export function guestSaveMatch(match: Omit<JobMatch, "id" | "scored_at">): JobMatch {
  const s = getStore();
  const full: JobMatch = {
    ...match,
    id: `demo-match-${Date.now()}`,
    scored_at: nowIso(),
    agent: match.agent ?? "job_match_scorer",
    agent_version: match.agent_version ?? "1.0",
  };
  s.jobs = s.jobs.map((j) => (j.id === match.job_id ? { ...j, match: full } : j));
  return full;
}

// ---- Guest preferences (local only) ----
let guestPrefs: CandidatePreferences | null = null;

function seedPreferences(): CandidatePreferences {
  return {
    ...EMPTY_PREFERENCES,
    job_goals: "Senior product engineering role with real ownership of the frontend platform.",
    career_direction: "Stay hands-on for two more years, then grow into staff-level scope.",
    target_titles: ["Senior Product Engineer", "Senior Frontend Engineer"],
    target_industries: ["SaaS", "Fintech"],
    excluded_titles: ["Salesforce Admin"],
    salary_min: 150000,
    salary_target: 185000,
    currency: "AUD",
    locations: ["Sydney"],
    work_arrangements: ["Remote", "Hybrid"],
    work_types: ["Full time"],
    mandatory_qualifications: [],
    dealbreakers: [],
    verified_experience:
      "8 years TypeScript/React, two 0→1 SaaS launches, mentored a team of 4.",
  };
}

export function guestFetchPreferences(): CandidatePreferences {
  if (!guestPrefs) guestPrefs = seedPreferences();
  return { ...guestPrefs };
}

export function guestSavePreferences(prefs: CandidatePreferences): CandidatePreferences {
  guestPrefs = { ...prefs };
  return { ...guestPrefs };
}

// Deterministic demo scoring based on job title vs profile
export async function guestScoreJob(
  job: JobWithMatch,
  prefs?: CandidatePreferences | null
): Promise<Omit<JobMatch, "id" | "scored_at" | "job_id" | "resume_profile_id">> {
  await new Promise((r) => setTimeout(r, 450));
  const effectivePrefs = prefs ?? guestFetchPreferences();
  const dealbreaker_hits = evaluateDealbreakers(job, effectivePrefs);

  const t = job.title.toLowerCase();
  let score = 60;
  if (/senior|staff|lead|principal/.test(t)) score += 15;
  if (/react|typescript|frontend|full ?stack|product/.test(t)) score += 15;
  if (/junior|intern|graduate|qa|admin|salesforce/.test(t)) score -= 30;
  if (/manager|director/.test(t)) score += 5;
  score = Math.max(15, Math.min(96, score));
  // A dealbreaker caps the score below the Review band.
  if (dealbreaker_hits.length > 0) {
    score = Math.min(score, Math.max(0, effectivePrefs.policy_review - 1));
  }

  const recommendation = bandLabel(score, effectivePrefs);
  const strong = score >= effectivePrefs.policy_strong;
  return {
    match_score: score,
    skill_match_percentage: Math.min(100, score + 5),
    recommendation,
    reasoning:
      dealbreaker_hits.length > 0
        ? `Deprioritised on your own constraints: ${dealbreaker_hits[0]}.`
        : strong
          ? "Core stack (TypeScript, React, Node) aligns with the JD; seniority matches profile."
          : "Partial overlap between the JD focus and the strongest parts of the profile.",
    pros: strong
      ? ["Core stack aligns", "Seniority match", "Product-focused engineering background"]
      : ["Some transferable experience"],
    cons: strong ? ["Domain (fintech/industry) may need ramp-up"] : ["Different specialisation"],
    gaps: ["No direct experience in the exact tooling stack mentioned"],
    concerns: strong ? [] : ["Seniority signal in the listing is ambiguous"],
    dealbreaker_hits,
    strategic_advice:
      dealbreaker_hits.length > 0
        ? "Only pursue if you are willing to relax the constraint above."
        : strong
          ? "Lead the resume summary with product impact and TypeScript depth."
          : "Worth a look, but a stronger match is likely elsewhere.",
    agent: "job_match_scorer",
    agent_version: "1.1-demo",
  };
}

export async function guestTailorResume(job: JobWithMatch): Promise<TailoredResume> {
  await new Promise((r) => setTimeout(r, 500));
  return {
    agent_meta: { agent: "resume_tailor", version: "1.0-demo" },
    target_role: { title: job.title, company: job.company },
    keywords_to_inject: ["TypeScript", "React", "Product engineering", "Ownership"],
    skills_to_emphasize: ["Full-stack TypeScript", "0→1 product delivery", "Mentoring"],
    summary_rewrite: `Senior product engineer with 8 years shipping SaaS in TypeScript + React. Excited to bring that to ${job.company}'s ${job.title} role.`,
    bullet_rewrites: [
      {
        section: "Experience",
        before: "Built features for the platform team.",
        after: "Led two 0→1 launches on a TypeScript/React stack, reducing time-to-value by 40%.",
        why: "Quantifies impact and mirrors the JD.",
      },
    ],
    gap_mitigation: [{ gap: "Domain experience", workaround: "Highlight adjacent SaaS work and rapid ramp-up examples." }],
    final_notes: "Keep it to one page for a senior IC role.",
  };
}

export async function guestCoverLetter(job: JobWithMatch): Promise<CoverLetter> {
  await new Promise((r) => setTimeout(r, 500));
  return {
    agent_meta: { agent: "cover_letter_writer", version: "1.0-demo" },
    target_role: { title: job.title, company: job.company },
    cover_letter: `Hi ${job.company} team,\n\nI'm applying for the ${job.title} role. Over eight years I've shipped TypeScript + React SaaS products, including two 0→1 launches. I'd love to bring that mix of product thinking and engineering craft to your team.\n\n— Demo Candidate`,
    key_points_used: ["8 years TypeScript/React", "Two 0→1 launches", "Product-focused"],
    suggested_subject_lines: [`${job.title} — Senior engineer with two 0→1 SaaS launches`],
    final_checklist: ["Personalise the opening line", "Confirm the hiring manager's name", "Attach the tailored resume"],
  };
}

export function guestSaveArtifact(a: Omit<JobArtifact, "id" | "created_at">): JobArtifact {
  const s = getStore();
  const full: JobArtifact = { ...a, id: `demo-art-${Date.now()}`, created_at: nowIso() };
  const list = s.artifacts.get(a.job_id) ?? [];
  s.artifacts.set(a.job_id, [...list.filter((x) => x.artifact_type !== a.artifact_type), full]);
  return full;
}

export function guestFetchArtifacts(jobId: string): JobArtifact[] {
  return getStore().artifacts.get(jobId) ?? [];
}
