

# Implementation Plan: Inbox-Sort-Track Pipeline Workflow

## Overview

This plan transforms the current job scraping dashboard into a full pipeline management system with four main sections: **Inbox**, **Shortlist**, **Not a Fit**, and **AI Lab**. Jobs will flow through a pipeline from discovery to outcome tracking.

---

## 1. Database Schema Changes

### Add columns to the existing `jobs` table:

```sql
-- Add pipeline tracking columns
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add constraint for valid pipeline statuses
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_pipeline_status_check 
  CHECK (pipeline_status IN ('inbox', 'shortlist', 'not_fit', 'applied', 'screening', 'interview', 'final_interview', 'offer', 'rejected', 'withdrawn'));

-- Create index for faster filtering by status
CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_status ON public.jobs(pipeline_status);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at_trigger
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_jobs_updated_at();
```

---

## 2. TypeScript Types Updates

### File: `src/types/job.ts`

Add pipeline status types and extend the Job interface:

```typescript
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

// Extend Job interface
export interface Job {
  // ...existing fields
  pipeline_status: PipelineStatus;
  notes: string | null;
  updated_at: string;
}
```

---

## 3. New Files to Create

### A. Navigation Sidebar Component
**File:** `src/components/layout/AppSidebar.tsx`

A navigation sidebar with links to:
- Inbox (with count badge)
- Shortlist (with count badge)  
- Not a Fit (with count badge)
- AI Lab

Uses the existing shadcn Sidebar components with NavLink for active route highlighting.

### B. Main Layout Wrapper
**File:** `src/components/layout/MainLayout.tsx`

Wraps the app with SidebarProvider, containing:
- Left navigation sidebar (always visible)
- Main content area with SidebarInset
- Mobile-responsive hamburger menu

### C. Shortlist Page
**File:** `src/pages/Shortlist.tsx`

A spreadsheet-style table showing jobs with `pipeline_status = 'shortlist'`:
- Sortable columns (title, company, score, posted date)
- Search/filter by title or company
- Inline notes editing (or modal)
- Pipeline stage dropdown selector
- Bulk selection and actions
- Actions: Move to Not a Fit, Update stage, Delete

### D. Not a Fit Page  
**File:** `src/pages/NotAFit.tsx`

Similar table view for rejected/not_fit jobs:
- Quick action to restore to Inbox
- Quick action to move to Shortlist
- Delete option

### E. AI Lab Page
**File:** `src/pages/AILab.tsx`

Analytics dashboard with:
- Score distribution buckets (0-49, 50-69, 70-84, 85-100)
- False positives table (scored >= 70 but ended in not_fit/rejected)
- False negatives table (scored < 50 but ended in interview/offer)
- Date range filter (7/30/90 days)
- Keyword/location filter

### F. Jobs Table Component
**File:** `src/components/jobs/JobsTable.tsx`

Reusable spreadsheet-style table component with:
- Checkbox column for selection
- Customizable columns
- Sorting functionality
- Inline editing for notes
- Pipeline stage dropdown
- Row actions menu

---

## 4. Files to Modify

### A. `src/App.tsx`
Add new routes:
```typescript
<Route path="/" element={<MainLayout />}>
  <Route index element={<Inbox />} />
  <Route path="shortlist" element={<Shortlist />} />
  <Route path="not-a-fit" element={<NotAFit />} />
  <Route path="ai-lab" element={<AILab />} />
</Route>
```

### B. `src/pages/Index.tsx` (becomes Inbox)
Rename/refactor to `src/pages/Inbox.tsx`:
- Filter to show only `pipeline_status = 'inbox'` jobs
- Add "Shortlist" and "Not a fit" quick action buttons to each job card
- Update stats cards to show pipeline counts
- After scoring: auto-move jobs with score < 50 to `not_fit` (only if still in inbox)

### C. `src/components/jobs/JobCard.tsx`
Add new action buttons:
- "Shortlist" button (star icon)
- "Not a fit" button (x icon)
- Keep existing Score and Delete buttons
- Add callback props: `onShortlist`, `onNotAFit`

### D. `src/components/jobs/JobList.tsx`
- Add bulk actions: "Move to Shortlist", "Move to Not a Fit"
- Pass new callbacks to JobCard
- Update header with new bulk action buttons

### E. `src/lib/api/jobs.ts`
Add new API functions:
```typescript
// Update single job status
export async function updateJobStatus(
  jobId: string, 
  status: PipelineStatus
): Promise<void>

// Bulk update job statuses
export async function bulkUpdateJobStatus(
  jobIds: string[], 
  status: PipelineStatus
): Promise<void>

// Update job notes
export async function updateJobNotes(
  jobId: string, 
  notes: string
): Promise<void>

// Fetch jobs by status
export async function fetchJobsByStatus(
  status: PipelineStatus | PipelineStatus[]
): Promise<JobWithMatch[]>
```

### F. `src/components/sidebar/JobStats.tsx`
Update to show pipeline stats:
- Inbox count
- Shortlist count
- Not a Fit count
- Interview+ count (interview, final_interview, offer)

---

## 5. Auto-Routing Logic

### When a job is scored:
After saving the match score in `handleScoreJob` (in Inbox page):
1. Check if `match_score < 50`
2. Check if job's current `pipeline_status === 'inbox'`
3. If both true, automatically update `pipeline_status` to `'not_fit'`
4. Show toast notification: "Job auto-moved to Not a Fit (low match score)"

This logic runs only once when scoring completes and respects any manual user overrides.

---

## 6. Component Details

### Navigation Sidebar Structure
```text
+------------------------+
|  JS-Searcher           |
|  AI Job Matcher        |
+------------------------+
|  Inbox           (12)  |
|  Shortlist        (5)  |
|  Not a Fit       (24)  |
|  AI Lab                |
+------------------------+
|  Resume Upload         |
|  [Resume status]       |
+------------------------+
```

### Shortlist/Not a Fit Table Columns
| Title | Company | Location | Posted | Score | Work Type | Arrangement | Salary | Notes | Stage | Actions |
|-------|---------|----------|--------|-------|-----------|-------------|--------|-------|-------|---------|

### Pipeline Stage Dropdown Options
- Applied
- Screening
- Interview
- Final Interview
- Offer
- Rejected
- Withdrawn

---

## 7. Implementation Order

1. **Database migration** - Add columns to jobs table
2. **Types update** - Add PipelineStatus type and extend Job interface
3. **API functions** - Add status update and bulk operations
4. **MainLayout + AppSidebar** - Create new layout structure
5. **Update App.tsx** - Add routing with new layout
6. **Refactor Index to Inbox** - Filter by inbox status, add quick actions
7. **Update JobCard** - Add Shortlist/Not a Fit buttons
8. **JobsTable component** - Create reusable table
9. **Shortlist page** - Implement spreadsheet view
10. **NotAFit page** - Implement spreadsheet view
11. **AI Lab page** - Implement analytics
12. **Auto-routing logic** - Add score-based routing after scoring

---

## Technical Notes

### Existing Patterns to Follow
- Use existing shadcn components (Table, Badge, Select, Dialog)
- Follow existing API pattern in `src/lib/api/jobs.ts`
- Use react-query patterns already in the project
- Use existing NavLink component for active route highlighting
- Use existing toast notifications for feedback

### Placeholder Prevention
The scraper already includes `isValidJob()` validation that rejects jobs with placeholder titles. The `upsertJobs` function in the API layer will also be updated to double-check before insertion.

### Date Display
The existing `formatDistanceToNow` from date-fns handles relative date display. For invalid dates, we'll fall back to the raw string or show nothing.

