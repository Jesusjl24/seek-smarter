

# JS-Searcher: AI-Powered SEEK Job Matcher

A personal job search tool that scrapes SEEK.com.au job listings, stores them in Supabase, and uses AI to match jobs against your resume.

---

## 🏗️ Phase 1: Foundation & Database Setup

### Database Tables
Set up Supabase with three core tables:
- **jobs** - Store scraped job listings with SEEK ID for deduplication
- **resume_profile** - Store parsed resume data (single-user, one row max)
- **job_matches** - Store AI-generated match scores and analysis

---

## 🔍 Phase 2: Job Search & Scraping

### Search Interface
- Text inputs for job title/keywords and location
- "Search Jobs" button with loading state

### Sidebar Filters
- Work Type checkboxes (Full time, Part time, Contract, Casual)
- Work Arrangement checkboxes (On-site, Hybrid, Remote)
- Minimum Salary dropdown ($50k - $150k+)
- Date Posted dropdown (Any time to Last 30 days)

### Scraping Implementation
Using **Firecrawl** for reliable web scraping:
- Build SEEK search URLs with filter parameters
- Extract job details: title, company, location, salary, work type, description
- Rate limiting (2-4 second delays) to avoid blocking
- Limit to 10-20 jobs per search

### Deduplication
- Check `seek_job_id` before inserting
- Upsert logic: update timestamp for existing jobs, insert new ones
- Show feedback: "Found 12 jobs (8 new, 4 already saved)"

---

## 📄 Phase 3: Resume Management

### Upload Interface
- File upload accepting PDF, DOCX, TXT (max 10MB)
- Current resume status display
- "Upload New Resume" button (replaces existing)

### Resume Parsing
- Extract raw text from uploaded files using edge functions
- Send to Lovable AI for structured extraction:
  - Technical & soft skills
  - Years of experience
  - Education & certifications
  - Previous job titles & industries
  - AI-generated summary
- Store parsed profile in Supabase (upsert pattern)
- Display parsed profile for verification

---

## 💼 Phase 4: Job Display & Cards

### Job List View
- Card-based layout showing:
  - Job title (linked to SEEK)
  - Company, location, salary
  - Work type badges
  - Description snippet
  - Date posted
  - Match score badge (color-coded)

### Match Score Colors
- 🟢 80-100: Strong Match
- 🔵 60-79: Good Match
- 🟡 40-59: Moderate Match
- ⚪ 0-39: Weak Match

### Job Detail View (Expandable/Modal)
- Full job description
- Complete match analysis:
  - Overall score with visual indicator
  - Skill match percentage
  - Pros, cons, and gaps lists
  - Strategic application advice

---

## 🤖 Phase 5: AI Job Matching

### Matching Triggers
- "Score All Jobs" button for batch scoring
- "Score This Job" button on individual cards
- Optional auto-score toggle for new jobs

### AI Analysis via Lovable AI
Compare candidate profile against job requirements:
- Calculate match score (0-100)
- Skill match percentage
- Recommendation category
- Detailed reasoning
- Pros, cons, and gaps
- Strategic advice for applying

### Caching
- Store results in `job_matches` table
- Skip re-scoring for existing matches

---

## 📊 Phase 6: Export & Polish

### CSV Export
Export button generating spreadsheet with:
- Job details (title, company, location, salary)
- Work type & arrangement
- Match score & recommendation
- Job URL, date posted, date scraped

### Error Handling
- Scraping failures: friendly retry messages
- Resume parse errors: file format guidance
- AI scoring failures: retry option
- No resume: prompt to upload first
- Network errors: connection status messages

---

## 📱 UI Layout

### Desktop-First Responsive Layout
```
+------------------+--------------------------------+
|     SIDEBAR      |          MAIN CONTENT          |
| [Filters]        |  [Search Bar]                  |
| [Resume Section] |  [Job Stats]                   |
| [Actions]        |  [Job Cards Grid]              |
+------------------+--------------------------------+
```

### Design
- Clean, functional productivity tool aesthetic
- Tailwind default color palette
- Scannable cards with prominent match scores
- Mobile-responsive

---

## 🔧 Technical Architecture

### Frontend (React + Tailwind)
- Job search form & filter components
- Job card & detail components
- Resume upload & profile display
- Match score visualization

### Backend (Lovable Cloud)
- **firecrawl-seek** - Scrape SEEK job listings
- **parse-resume** - Extract text from PDF/DOCX/TXT
- **ai-analyze-resume** - Parse resume with AI
- **ai-score-job** - Generate match analysis

### Integrations
- **Firecrawl** - Web scraping service
- **Lovable AI** - Resume parsing & job matching
- **Supabase** - Database & file storage

