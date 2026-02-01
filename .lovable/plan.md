
# Implementation Plan: AI-Driven Job Fit, Resume Tailoring & Cover Letter Agent System

## Overview

This plan extends the existing job scoring infrastructure into a complete 3-agent AI workflow:

1. **Job Match Scoring Agent** (upgraded) - Rubric-based deterministic evaluation
2. **Resume Tailoring Agent** (new) - Generate actionable resume suggestions for jobs scoring ≥60
3. **Cover Letter Agent** (new) - Generate professional cover letters for jobs scoring ≥60

All generated artifacts will be stored in a new `job_artifacts` table for auditability and analytics.

---

## 1. Database Changes

### New Table: `job_artifacts`

Stores all AI-generated content (scores, tailored resumes, cover letters) with full agent metadata for auditing and AI Lab analytics.

```sql
CREATE TABLE public.job_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL, -- 'score' | 'tailored_resume' | 'cover_letter'
  content JSONB NOT NULL,
  agent TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_job_artifacts_job_id ON public.job_artifacts(job_id);
CREATE INDEX idx_job_artifacts_type ON public.job_artifacts(artifact_type);
```

### Update `job_matches` table

Add agent metadata columns to track scoring agent version:

```sql
ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS agent TEXT DEFAULT 'job_match_scorer',
  ADD COLUMN IF NOT EXISTS agent_version TEXT DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS veto_reasons TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scores JSONB;
```

---

## 2. Edge Functions

### A. Upgrade `score-job` (Agent 1 - Job Match Scorer)

**Location:** `supabase/functions/score-job/index.ts`

**Changes:**
- Implement strict 5-category rubric scoring:
  - Hard Skills Alignment (35%)
  - Experience & Seniority (30%)
  - Impact & Achievements (20%)
  - Education & Certifications (10%)
  - Soft Skills & Culture (5%)
- Return structured output with `agent_meta`, `scores`, `veto_reasons`, `evidence_gaps`
- New recommendation values: `APPLY` | `CAUTIOUS_APPLY` | `DO_NOT_APPLY`
- Thresholds: 80-100 → APPLY, 60-79 → CAUTIOUS_APPLY, 0-59 → DO_NOT_APPLY
- Add system prompt enforcing deterministic recruiter persona

**Output Schema:**
```json
{
  "agent_meta": { "agent": "job_match_scorer", "version": "1.0", "alignment_check": "ALIGNED" },
  "scores": {
    "hard_skills": 0,
    "experience_seniority": 0,
    "impact": 0,
    "credentials": 0,
    "soft_skills": 0
  },
  "final_score": 0,
  "skill_match_percentage": 0,
  "recommendation": "APPLY | CAUTIOUS_APPLY | DO_NOT_APPLY",
  "veto_reasons": [],
  "evidence_gaps": [],
  "pros": [],
  "cons": [],
  "reasoning": "2-3 sentences",
  "strategic_advice": "1-2 sentences"
}
```

### B. Create `tailor-resume` (Agent 2 - Resume Tailor)

**Location:** `supabase/functions/tailor-resume/index.ts`

**Preconditions:**
- Requires `final_score >= 60` (return 409 Conflict otherwise)

**Purpose:**
- Generate truthful, copy-paste-ready resume tailoring suggestions
- Rephrase and reorder existing experience (no fabrication)
- Identify keywords to inject and skills to emphasize

**Output Schema:**
```json
{
  "agent_meta": { "agent": "resume_tailor", "version": "1.0" },
  "target_role": { "title": "", "company": "" },
  "keywords_to_inject": [],
  "skills_to_emphasize": [],
  "summary_rewrite": "2-3 line tailored summary",
  "bullet_rewrites": [
    {
      "section": "Experience",
      "before": "Original phrasing",
      "after": "Rewritten bullet aligned to JD",
      "why": "Improvement explanation"
    }
  ],
  "gap_mitigation": [
    { "gap": "Missing requirement", "workaround": "Truthful positioning strategy" }
  ],
  "final_notes": "How to tailor without misrepresentation"
}
```

### C. Create `generate-cover-letter` (Agent 3 - Cover Letter Writer)

**Location:** `supabase/functions/generate-cover-letter/index.ts`

**Preconditions:**
- Requires `final_score >= 60` (return 409 Conflict otherwise)

**Purpose:**
- Generate professional Australian-style cover letter
- Concise, role-specific, no fluff or fabrication
- Uses tailored resume highlights

**Output Schema:**
```json
{
  "agent_meta": { "agent": "cover_letter_writer", "version": "1.0" },
  "target_role": { "title": "", "company": "" },
  "cover_letter": "Full letter text with paragraphs",
  "key_points_used": [],
  "suggested_subject_lines": [],
  "final_checklist": [
    "Tailored to role",
    "Matches JD language",
    "No fabricated claims"
  ]
}
```

---

## 3. TypeScript Types

### File: `src/types/job.ts`

Add new types for agent outputs and artifacts:

```typescript
// Agent metadata
export interface AgentMeta {
  agent: string;
  version: string;
  alignment_check?: string;
}

// Rubric-based scores
export interface RubricScores {
  hard_skills: number;
  experience_seniority: number;
  impact: number;
  credentials: number;
  soft_skills: number;
}

// Extended JobMatch with agent metadata
export interface JobMatch {
  // ...existing fields
  agent?: string;
  agent_version?: string;
  veto_reasons?: string[];
  scores?: RubricScores;
}

// Tailored resume artifact
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

// Cover letter artifact
export interface CoverLetter {
  agent_meta: AgentMeta;
  target_role: { title: string; company: string };
  cover_letter: string;
  key_points_used: string[];
  suggested_subject_lines: string[];
  final_checklist: string[];
}

// Job artifact record
export interface JobArtifact {
  id: string;
  job_id: string;
  artifact_type: 'score' | 'tailored_resume' | 'cover_letter';
  content: TailoredResume | CoverLetter | Record<string, unknown>;
  agent: string;
  version: string;
  created_at: string;
}
```

---

## 4. API Layer Updates

### File: `src/lib/api/jobs.ts`

Add new functions:

```typescript
// Fetch artifacts for a job
export async function fetchJobArtifacts(jobId: string): Promise<JobArtifact[]>

// Save a job artifact
export async function saveJobArtifact(artifact: Omit<JobArtifact, 'id' | 'created_at'>): Promise<JobArtifact>

// Generate tailored resume (calls edge function)
export async function generateTailoredResume(jobId: string, job: Job, profile: ResumeProfile): Promise<TailoredResume>

// Generate cover letter (calls edge function)
export async function generateCoverLetter(jobId: string, job: Job, profile: ResumeProfile): Promise<CoverLetter>
```

---

## 5. UI Components

### A. New: `ArtifactGeneratorButtons.tsx`

**Location:** `src/components/jobs/ArtifactGeneratorButtons.tsx`

A component that shows "Generate Resume" and "Generate Cover Letter" buttons:
- Only enabled when `match_score >= 60`
- Shows loading state during generation
- Disabled with tooltip explaining why if score is too low

### B. New: `TailoredResumeModal.tsx`

**Location:** `src/components/jobs/TailoredResumeModal.tsx`

Modal displaying the tailored resume with:
- Keywords to inject (as badges)
- Skills to emphasize
- Summary rewrite with copy button
- Bullet rewrites in a before/after format
- Gap mitigation strategies
- Copy all to clipboard button

### C. New: `CoverLetterModal.tsx`

**Location:** `src/components/jobs/CoverLetterModal.tsx`

Modal displaying the cover letter with:
- Full formatted letter text
- Key points used (as badges)
- Subject line suggestions
- Checklist items with checkmarks
- Copy to clipboard button
- Download as .txt option

---

## 6. Page Updates

### A. Shortlist Page (`src/pages/Shortlist.tsx`)

Add artifact generation capabilities:

1. Add state for artifact modals and loading
2. Pass generation handlers to JobsTable
3. Show modals for viewing generated content
4. Add "Generate Resume" and "Generate Cover Letter" buttons to each row (enabled when score ≥ 60)

### B. JobsTable Component (`src/components/jobs/JobsTable.tsx`)

Add new columns/actions:

1. Add optional `onGenerateResume` and `onGenerateCoverLetter` callbacks
2. Add "AI" column or integrate into Actions dropdown
3. Show artifact status indicators (checkmarks for generated content)

### C. AI Lab Page (`src/pages/AILab.tsx`)

Enhance with agent version tracking:

1. Add "Agent Version Performance" card showing v1.0 stats
2. Track which agent version scored each job
3. Compare false positive/negative rates by version (for future improvements)

---

## 7. Implementation Order

### Phase 1: Database & Types
1. Create migration for `job_artifacts` table
2. Add agent columns to `job_matches` table
3. Update TypeScript types

### Phase 2: Edge Functions
4. Upgrade `score-job` with rubric-based scoring
5. Create `tailor-resume` edge function
6. Create `generate-cover-letter` edge function
7. Update `supabase/config.toml` with new functions

### Phase 3: API Layer
8. Add artifact fetch/save functions
9. Add generation wrapper functions

### Phase 4: UI Components
10. Create `ArtifactGeneratorButtons` component
11. Create `TailoredResumeModal` component
12. Create `CoverLetterModal` component

### Phase 5: Page Integration
13. Update Shortlist page with generation features
14. Update JobsTable with generation buttons
15. Enhance AI Lab with agent version tracking

---

## 8. File Summary

### New Files
- `supabase/functions/tailor-resume/index.ts`
- `supabase/functions/generate-cover-letter/index.ts`
- `src/components/jobs/ArtifactGeneratorButtons.tsx`
- `src/components/jobs/TailoredResumeModal.tsx`
- `src/components/jobs/CoverLetterModal.tsx`

### Modified Files
- `supabase/functions/score-job/index.ts` (upgrade to rubric-based)
- `supabase/config.toml` (add new functions)
- `src/types/job.ts` (add new types)
- `src/lib/api/jobs.ts` (add artifact functions)
- `src/pages/Shortlist.tsx` (add generation UI)
- `src/components/jobs/JobsTable.tsx` (add AI column)
- `src/pages/AILab.tsx` (add agent version tracking)

### Database Migrations
- Create `job_artifacts` table
- Add `agent`, `agent_version`, `veto_reasons`, `scores` columns to `job_matches`

---

## 9. Key Technical Decisions

1. **Score threshold of 60**: Prevents wasting AI credits on poor matches
2. **409 Conflict response**: Clear HTTP semantics for precondition failure
3. **JSONB content storage**: Flexible schema for different artifact types
4. **Agent versioning**: Enables A/B testing and performance tracking
5. **Cascading deletes**: Artifacts auto-delete when job is deleted
6. **Deterministic prompts**: Strict system prompts prevent hallucination
