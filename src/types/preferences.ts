// Candidate preferences + score policy shared across the app.

export interface ScorePolicy {
  /** Score at or above this is "Strong Apply". Default 80. */
  policy_strong: number;
  /** Score at or above this (and below strong) is "Review". Default 75. */
  policy_review: number;
}

export const DEFAULT_POLICY: ScorePolicy = {
  policy_strong: 80,
  policy_review: 75,
};

export interface CandidatePreferences extends ScorePolicy {
  user_id?: string;
  job_goals: string | null;
  career_direction: string | null;
  target_titles: string[];
  target_industries: string[];
  excluded_titles: string[];
  excluded_industries: string[];
  auto_generate_drafts: boolean;
  salary_min: number | null;
  salary_target: number | null;
  currency: string;
  locations: string[];
  work_arrangements: string[];
  work_types: string[];
  mandatory_qualifications: string[];
  dealbreakers: string[];
  verified_experience: string | null;
  created_at?: string;
  updated_at?: string;
}

export const EMPTY_PREFERENCES: CandidatePreferences = {
  job_goals: null,
  career_direction: null,
  target_titles: [],
  target_industries: [],
  excluded_titles: [],
  excluded_industries: [],
  auto_generate_drafts: false,
  salary_min: null,
  salary_target: null,
  currency: "AUD",
  locations: [],
  work_arrangements: [],
  work_types: [],
  mandatory_qualifications: [],
  dealbreakers: [],
  verified_experience: null,
  ...DEFAULT_POLICY,
};

export const WORK_ARRANGEMENT_OPTIONS = ["Remote", "Hybrid", "On-site"] as const;
export const WORK_TYPE_OPTIONS = [
  "Full time",
  "Part time",
  "Contract",
  "Casual",
] as const;
