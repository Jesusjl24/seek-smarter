# JS-Searcher - Project Session Document

## Project Overview

JS-Searcher is a **single-user personal tool** designed to:
1. Scrape job listings from SEEK.com.au
2. Store them in a Supabase database
3. Use AI to match jobs against an uploaded resume
4. Provide detailed analysis of job fit with pros, cons, skill gaps, and strategic advice

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Backend**: Supabase (Lovable Cloud)
  - PostgreSQL database
  - Edge Functions (Deno)
- **Web Scraping**: Firecrawl API (with AI-powered structured extraction)
- **AI Matching**: Lovable AI (uses Google Gemini/OpenAI models)
- **State Management**: React useState/useCallback, TanStack Query available

## Database Schema

### Tables

#### `jobs`
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | uuid | No | Primary key (auto-generated) |
| seek_job_id | text | No | Unique SEEK job identifier |
| title | text | No | Job title |
| company | text | No | Company name |
| location | text | No | Job location |
| salary_range | text | Yes | Salary range if available |
| work_type | text | Yes | Full-time, Part-time, Contract, Casual |
| work_arrangement | text | Yes | Remote, Hybrid, On-site |
| description_snippet | text | No | Brief job description |
| full_description | text | Yes | Full job description |
| job_url | text | No | Link to SEEK listing |
| date_posted | date | Yes | When job was posted |
| date_scraped | timestamp | No | When job was scraped (default: now()) |

#### `resume_profile`
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | uuid | No | Primary key |
| raw_text | text | No | Original resume text |
| skills_technical | text[] | Yes | Technical skills array |
| skills_soft | text[] | Yes | Soft skills array |
| years_experience | integer | Yes | Years of experience |
| education | text[] | Yes | Education entries |
| certifications | text[] | Yes | Certifications |
| previous_titles | text[] | Yes | Previous job titles |
| industries | text[] | Yes | Industries worked in |
| summary | text | Yes | AI-generated summary |
| updated_at | timestamp | No | Last update time |

#### `job_matches`
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | uuid | No | Primary key |
| job_id | uuid | No | Foreign key to jobs |
| resume_profile_id | uuid | No | Foreign key to resume_profile |
| match_score | integer | No | 0-100 match score |
| skill_match_percentage | integer | Yes | Skill overlap percentage |
| recommendation | text | No | Strong/Good/Moderate/Weak Match |
| reasoning | text | Yes | Explanation of score |
| pros | text[] | Yes | Positive factors |
| cons | text[] | Yes | Negative factors |
| gaps | text[] | Yes | Missing skills |
| strategic_advice | text | Yes | Application strategy |
| scored_at | timestamp | No | When scored |

### RLS Policies
All tables have permissive RLS policies (`USING (true)`) since this is a single-user application with no authentication.

## Edge Functions

### `scrape-seek`
- **Purpose**: Scrapes job listings from SEEK using Firecrawl
- **Input**: `{ keywords, location, limit, filters }`
- **Process**: 
  - Builds SEEK search URL with filters
  - Uses Firecrawl's `extract` format with AI schema for structured data
  - Falls back to markdown/HTML parsing if extraction fails
- **Output**: `{ success, jobs: ScrapedJob[] }`
- **Known Issue**: AI extraction can be slow (~30-60 seconds)

### `parse-resume`
- **Purpose**: Parses uploaded resume files (PDF, DOCX, TXT)
- **Input**: `{ fileContent (base64), fileName, fileType }`
- **Process**: Uses AI to extract structured resume data
- **Output**: Parsed resume profile data

### `score-job`
- **Purpose**: AI-powered job matching
- **Input**: `{ job, profile }`
- **Process**: Compares job requirements against resume profile
- **Output**: Match score, recommendation, pros, cons, gaps, advice

## Implemented Features

### ✅ Job Search
- Search bar with keywords and location
- Filter panel: work types, arrangements, salary, date posted
- Job limit selector (10, 20, 30, 50 jobs)
- Progress animation during scraping

### ✅ Job Display
- Job cards with title, company, location, date posted
- Match score badge (color-coded: green/blue/yellow/gray)
- Work type and arrangement badges
- Salary display when available
- Link to view on SEEK

### ✅ Job Management
- Checkbox selection on job cards
- Multi-select deletion with confirmation
- Delete All with confirmation
- Individual job deletion

### ✅ Resume Handling
- Resume upload (PDF, DOCX, TXT)
- Resume parsing with AI
- View Resume modal showing parsed profile
- Skills, experience, education display

### ✅ AI Scoring
- Score individual jobs against resume
- Score all unscored jobs (batch)
- Auto-popup showing analysis after scoring
- Detailed breakdown: pros, cons, gaps, advice

### ✅ Job Detail Modal
- Full job information display
- Match analysis section when scored
- Strategic advice display
- Link to SEEK listing

## Current Issues / Known Bugs

### 🔴 Jobs Not Saving to Database
- **Symptom**: Search shows "Found X jobs" but database remains empty
- **Root Cause**: Unknown - added error logging to diagnose
- **Debug**: Check browser console for insert errors after searching
- **Files**: `src/lib/api/jobs.ts` (upsertJobs function)

### 🟡 Placeholder Data from Scraper
- **Symptom**: Cards show "Job Listing #X" instead of real titles
- **Cause**: Firecrawl extraction not finding job IDs in extracted data
- **Status**: Improved extraction logic, testing required

### 🟡 Slow Scraping
- **Symptom**: 30-60 second wait for search results
- **Cause**: Firecrawl AI extraction + JavaScript rendering
- **Mitigation**: Progress animation added for UX

## File Structure

```
src/
├── components/
│   ├── jobs/
│   │   ├── JobCard.tsx        # Individual job card with checkbox
│   │   ├── JobDetailModal.tsx # Job details popup
│   │   ├── JobList.tsx        # Job grid with selection management
│   │   └── MatchScoreBadge.tsx # Color-coded score badge
│   ├── resume/
│   │   ├── ResumeUpload.tsx   # Upload + view resume
│   │   └── ResumeViewModal.tsx # Resume profile display
│   ├── search/
│   │   ├── SearchBar.tsx      # Keywords + location inputs
│   │   ├── SearchFilters.tsx  # Filter panel (sidebar)
│   │   └── SearchProgress.tsx # Loading overlay with progress
│   ├── sidebar/
│   │   ├── ActionButtons.tsx  # Score All, Export buttons
│   │   └── JobStats.tsx       # Total/Scored/Recent counts
│   ├── layout/
│   │   └── AppLayout.tsx      # Main layout with sidebar
│   └── ui/                    # shadcn/ui components
├── lib/
│   └── api/
│       ├── jobs.ts            # Job CRUD operations
│       └── resume.ts          # Resume operations
├── types/
│   └── job.ts                 # TypeScript interfaces
├── pages/
│   └── Index.tsx              # Main page component
└── integrations/
    └── supabase/
        ├── client.ts          # Supabase client (auto-generated)
        └── types.ts           # Database types (auto-generated)

supabase/
└── functions/
    ├── scrape-seek/index.ts   # SEEK scraping
    ├── parse-resume/index.ts  # Resume parsing
    └── score-job/index.ts     # AI job matching
```

## Environment / Secrets

| Secret | Purpose |
|--------|---------|
| FIRECRAWL_API_KEY | Firecrawl connector for web scraping |
| LOVABLE_API_KEY | Lovable AI for scoring/parsing |
| SUPABASE_* | Auto-configured Supabase connection |

## Next Steps / TODO

1. **Debug database insertion** - Check console logs to find why jobs aren't saving
2. **Verify job data extraction** - Ensure Firecrawl returns real job details
3. **Test end-to-end flow** - Search → Display → Score → Analysis
4. **Performance optimization** - Consider caching or faster scraping
5. **Add sorting** - Sort jobs by score, date, company
6. **Export functionality** - CSV export is implemented but untested

## AI Matching Logic

Match scores use color-coded badges:
- 🟢 **80-100**: Strong Match (green)
- 🔵 **60-79**: Good Match (blue)
- 🟡 **40-59**: Moderate Match (yellow)
- ⚪ **0-39**: Weak Match (gray)

## Commands / Testing

```bash
# Local development
npm run dev

# Run tests
npm run test

# Type checking
npm run typecheck
```

## Notes for AI Assistants

- This is a **Lovable** project - use Supabase tools for database changes
- Edge functions deploy automatically on code save
- The `src/integrations/supabase/` files are auto-generated - do not edit
- Use `supabase--migration` tool for schema changes
- Check edge function logs with `supabase--edge-function-logs`
- Single-user app - no auth required, RLS is permissive
