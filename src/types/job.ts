// Pipeline status values
export type PipelineStatus = 
  | 'inbox' 
  | 'shortlist' 
  | 'not_fit' 
  | 'applied' 
  | 'screening' 
  | 'interview' 
  | 'final_interview' 
  | 'offer' 
  | 'rejected' 
  | 'withdrawn';

// Agent metadata
export interface AgentMeta {
  agent: string;
  version: string;
  alignment_check?: string;
}

// Rubric-based scores from scoring agent
export interface RubricScores {
  hard_skills: number;
  experience_seniority: number;
  impact: number;
  credentials: number;
  soft_skills: number;
}

export interface Job {
  id: string;
  seek_job_id: string;
  title: string;
  company: string;
  location: string;
  salary_range: string | null;
  work_type: string | null;
  work_arrangement: string | null;
  description_snippet: string;
  full_description: string | null;
  job_url: string;
  date_posted: string | null;
  date_scraped: string;
  pipeline_status: PipelineStatus;
  notes: string | null;
  updated_at: string;
}

export interface ResumeProfile {
  id: string;
  raw_text: string;
  skills_technical: string[];
  skills_soft: string[];
  years_experience: number | null;
  education: string[];
  certifications: string[];
  previous_titles: string[];
  industries: string[];
  summary: string | null;
  updated_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
}

export interface JobMatch {
  id: string;
  job_id: string;
  resume_profile_id: string;
  match_score: number;
  skill_match_percentage: number | null;
  recommendation: string;
  reasoning: string | null;
  pros: string[];
  cons: string[];
  gaps: string[];
  strategic_advice: string | null;
  scored_at: string;
  // Agent metadata fields
  agent?: string;
  agent_version?: string;
  veto_reasons?: string[];
  scores?: RubricScores;
}

// Tailored resume artifact from resume_tailor agent
export interface TailoredResume {
  agent_meta: AgentMeta;
  target_role: { title: string; company: string };
  keywords_to_inject: string[];
  skills_to_emphasize: string[];
  summary_rewrite: string;
  bullet_rewrites: Array<{
    section: string;
    before: string;
    after: string;
    why: string;
  }>;
  gap_mitigation: Array<{ gap: string; workaround: string }>;
  final_notes: string;
}

// Cover letter artifact from cover_letter_writer agent
export interface CoverLetter {
  agent_meta: AgentMeta;
  target_role: { title: string; company: string };
  cover_letter: string;
  key_points_used: string[];
  suggested_subject_lines: string[];
  final_checklist: string[];
}

// Job artifact record stored in database
export interface JobArtifact {
  id: string;
  job_id: string;
  artifact_type: 'score' | 'tailored_resume' | 'cover_letter';
  content: TailoredResume | CoverLetter | Record<string, unknown>;
  agent: string;
  version: string;
  created_at: string;
}

export interface JobWithMatch extends Job {
  match?: JobMatch;
}

export interface SearchFilters {
  keywords: string;
  location: string;
  workType: string; // single selection: full-time, part-time, contract, casual
  workArrangement: string; // single selection: on-site, hybrid, remote
  salaryMin: string;
  salaryMax: string;
  salaryType: string; // annual, monthly, hourly
  datePosted: string;
  jobLimit: string;
}

export interface ScrapedJob {
  seek_job_id: string;
  title: string;
  company: string;
  location: string;
  salary_range?: string;
  work_type?: string;
  work_arrangement?: string;
  description_snippet: string;
  full_description?: string;
  job_url: string;
  date_posted?: string;
}

// Pipeline counts for sidebar stats
export interface PipelineCounts {
  inbox: number;
  shortlist: number;
  not_fit: number;
  applied: number;
  interview: number;
  offer: number;
}
