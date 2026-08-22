export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_credentials: {
        Row: {
          agent_id: string
          created_at: string
          expires_at: string
          id: string
          key_id: string
          last_used_at: string | null
          owner_user_id: string
          revoked_at: string | null
          scopes: string[]
          secret_hash: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_at?: string
          id?: string
          key_id: string
          last_used_at?: string | null
          owner_user_id?: string
          revoked_at?: string | null
          scopes?: string[]
          secret_hash: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          key_id?: string
          last_used_at?: string | null
          owner_user_id?: string
          revoked_at?: string | null
          scopes?: string[]
          secret_hash?: string
        }
        Relationships: []
      }
      agent_nonces: {
        Row: {
          key_id: string
          nonce: string
          seen_at: string
        }
        Insert: {
          key_id: string
          nonce: string
          seen_at?: string
        }
        Update: {
          key_id?: string
          nonce?: string
          seen_at?: string
        }
        Relationships: []
      }
      agent_request_log: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          idempotency_key: string
          owner_user_id: string
          request_id: string | null
          response_json: Json
          route: string
          status_code: number
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          owner_user_id: string
          request_id?: string | null
          response_json: Json
          route: string
          status_code: number
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          owner_user_id?: string
          request_id?: string | null
          response_json?: Json
          route?: string
          status_code?: number
        }
        Relationships: []
      }
      agent_usage: {
        Row: {
          agent_id: string
          day_count: number
          day_start: string
          minute_count: number
          window_start: string
        }
        Insert: {
          agent_id: string
          day_count?: number
          day_start: string
          minute_count?: number
          window_start: string
        }
        Update: {
          agent_id?: string
          day_count?: number
          day_start?: string
          minute_count?: number
          window_start?: string
        }
        Relationships: []
      }
      application_events: {
        Row: {
          created_at: string
          event_at: string
          event_type: string
          external_reference: string | null
          id: string
          job_id: string
          notes: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_at?: string
          event_type: string
          external_reference?: string | null
          id?: string
          job_id: string
          notes?: string | null
          source?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          event_at?: string
          event_type?: string
          external_reference?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_job_id_user_id_fkey"
            columns: ["job_id", "user_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      application_packages: {
        Row: {
          approved_at: string | null
          checklist: Json
          cover_letter_content_hash: string | null
          cover_letter_document_revision_id: string | null
          created_at: string
          id: string
          job_id: string
          package_hash: string
          resume_content_hash: string | null
          resume_document_revision_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          checklist?: Json
          cover_letter_content_hash?: string | null
          cover_letter_document_revision_id?: string | null
          created_at?: string
          id?: string
          job_id: string
          package_hash: string
          resume_content_hash?: string | null
          resume_document_revision_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          approved_at?: string | null
          checklist?: Json
          cover_letter_content_hash?: string | null
          cover_letter_document_revision_id?: string | null
          created_at?: string
          id?: string
          job_id?: string
          package_hash?: string
          resume_content_hash?: string | null
          resume_document_revision_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_packages_cover_letter_document_revision_id_use_fkey"
            columns: ["cover_letter_document_revision_id", "user_id"]
            isOneToOne: false
            referencedRelation: "document_revisions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "application_packages_job_id_user_id_fkey"
            columns: ["job_id", "user_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "application_packages_resume_document_revision_id_user_id_fkey"
            columns: ["resume_document_revision_id", "user_id"]
            isOneToOne: false
            referencedRelation: "document_revisions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      approval_decisions: {
        Row: {
          approved_hash: string | null
          comment: string | null
          created_at: string
          decided_at: string
          decision: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          approved_hash?: string | null
          comment?: string | null
          created_at?: string
          decided_at?: string
          decision: string
          entity_id: string
          entity_type: string
          id?: string
          user_id?: string
        }
        Update: {
          approved_hash?: string | null
          comment?: string | null
          created_at?: string
          decided_at?: string
          decision?: string
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      assistant_recommendations: {
        Row: {
          agent_version: string
          concerns: string[]
          created_at: string
          evidence_gaps: string[]
          hard_blockers: string[]
          id: string
          job_id: string
          proposed_action: string | null
          reasoning: string | null
          recommendation_band: string
          score: number
          status: string
          strengths: string[]
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_version?: string
          concerns?: string[]
          created_at?: string
          evidence_gaps?: string[]
          hard_blockers?: string[]
          id?: string
          job_id: string
          proposed_action?: string | null
          reasoning?: string | null
          recommendation_band: string
          score: number
          status?: string
          strengths?: string[]
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          agent_version?: string
          concerns?: string[]
          created_at?: string
          evidence_gaps?: string[]
          hard_blockers?: string[]
          id?: string
          job_id?: string
          proposed_action?: string | null
          reasoning?: string | null
          recommendation_band?: string
          score?: number
          status?: string
          strengths?: string[]
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_recommendations_job_id_user_id_fkey"
            columns: ["job_id", "user_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "assistant_recommendations_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "assistant_tasks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      assistant_runs: {
        Row: {
          agent_version: string
          completed_at: string | null
          created_at: string
          failure_message: string | null
          id: string
          jobs_assessed: number
          jobs_found: number
          model: string | null
          questions_count: number
          recommendations_count: number
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          agent_version?: string
          completed_at?: string | null
          created_at?: string
          failure_message?: string | null
          id?: string
          jobs_assessed?: number
          jobs_found?: number
          model?: string | null
          questions_count?: number
          recommendations_count?: number
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          agent_version?: string
          completed_at?: string | null
          created_at?: string
          failure_message?: string | null
          id?: string
          jobs_assessed?: number
          jobs_found?: number
          model?: string | null
          questions_count?: number
          recommendations_count?: number
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      assistant_tasks: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          idempotency_key: string
          input_snapshot_hash: string | null
          job_id: string | null
          job_revision_id: string | null
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          preferences_version: number | null
          resume_revision_id: string | null
          run_id: string | null
          status: string
          task_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          idempotency_key: string
          input_snapshot_hash?: string | null
          job_id?: string | null
          job_revision_id?: string | null
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          preferences_version?: number | null
          resume_revision_id?: string | null
          run_id?: string | null
          status?: string
          task_type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          input_snapshot_hash?: string | null
          job_id?: string | null
          job_revision_id?: string | null
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          preferences_version?: number | null
          resume_revision_id?: string | null
          run_id?: string | null
          status?: string
          task_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_tasks_job_id_user_id_fkey"
            columns: ["job_id", "user_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "assistant_tasks_job_revision_fkey"
            columns: ["job_revision_id", "user_id"]
            isOneToOne: false
            referencedRelation: "job_revisions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "assistant_tasks_resume_revision_id_user_id_fkey"
            columns: ["resume_revision_id", "user_id"]
            isOneToOne: false
            referencedRelation: "resume_revisions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "assistant_tasks_run_id_user_id_fkey"
            columns: ["run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "assistant_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      candidate_facts: {
        Row: {
          created_at: string
          evidence_reference: string | null
          fact_text: string
          fact_type: string
          id: string
          resume_revision_id: string
          user_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          evidence_reference?: string | null
          fact_text: string
          fact_type: string
          id?: string
          resume_revision_id: string
          user_id?: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          evidence_reference?: string | null
          fact_text?: string
          fact_type?: string
          id?: string
          resume_revision_id?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "candidate_facts_resume_revision_id_user_id_fkey"
            columns: ["resume_revision_id", "user_id"]
            isOneToOne: false
            referencedRelation: "resume_revisions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      candidate_preferences: {
        Row: {
          career_direction: string | null
          created_at: string
          currency: string
          dealbreakers: string[]
          excluded_titles: string[]
          job_goals: string | null
          locations: string[]
          mandatory_qualifications: string[]
          policy_review: number
          policy_strong: number
          salary_min: number | null
          salary_target: number | null
          target_industries: string[]
          target_titles: string[]
          updated_at: string
          user_id: string
          verified_experience: string | null
          work_arrangements: string[]
          work_types: string[]
        }
        Insert: {
          career_direction?: string | null
          created_at?: string
          currency?: string
          dealbreakers?: string[]
          excluded_titles?: string[]
          job_goals?: string | null
          locations?: string[]
          mandatory_qualifications?: string[]
          policy_review?: number
          policy_strong?: number
          salary_min?: number | null
          salary_target?: number | null
          target_industries?: string[]
          target_titles?: string[]
          updated_at?: string
          user_id: string
          verified_experience?: string | null
          work_arrangements?: string[]
          work_types?: string[]
        }
        Update: {
          career_direction?: string | null
          created_at?: string
          currency?: string
          dealbreakers?: string[]
          excluded_titles?: string[]
          job_goals?: string | null
          locations?: string[]
          mandatory_qualifications?: string[]
          policy_review?: number
          policy_strong?: number
          salary_min?: number | null
          salary_target?: number | null
          target_industries?: string[]
          target_titles?: string[]
          updated_at?: string
          user_id?: string
          verified_experience?: string | null
          work_arrangements?: string[]
          work_types?: string[]
        }
        Relationships: []
      }
      document_revisions: {
        Row: {
          agent_version: string
          approval_status: string
          content: Json
          content_hash: string
          created_at: string
          document_type: string
          docx_path: string | null
          generated_at: string
          id: string
          job_id: string | null
          label: string | null
          pdf_path: string | null
          revision_number: number
          source_resume_revision_id: string | null
          storage_path: string | null
          supersedes_revision_id: string | null
          supporting_fact_ids: string[]
          truth_check: Json
          truth_check_status: string
          user_id: string
        }
        Insert: {
          agent_version?: string
          approval_status?: string
          content?: Json
          content_hash: string
          created_at?: string
          document_type: string
          docx_path?: string | null
          generated_at?: string
          id?: string
          job_id?: string | null
          label?: string | null
          pdf_path?: string | null
          revision_number: number
          source_resume_revision_id?: string | null
          storage_path?: string | null
          supersedes_revision_id?: string | null
          supporting_fact_ids?: string[]
          truth_check?: Json
          truth_check_status?: string
          user_id?: string
        }
        Update: {
          agent_version?: string
          approval_status?: string
          content?: Json
          content_hash?: string
          created_at?: string
          document_type?: string
          docx_path?: string | null
          generated_at?: string
          id?: string
          job_id?: string | null
          label?: string | null
          pdf_path?: string | null
          revision_number?: number
          source_resume_revision_id?: string | null
          storage_path?: string | null
          supersedes_revision_id?: string | null
          supporting_fact_ids?: string[]
          truth_check?: Json
          truth_check_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_revisions_job_id_user_id_fkey"
            columns: ["job_id", "user_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "document_revisions_source_resume_revision_id_user_id_fkey"
            columns: ["source_resume_revision_id", "user_id"]
            isOneToOne: false
            referencedRelation: "resume_revisions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "document_revisions_supersedes_revision_id_user_id_fkey"
            columns: ["supersedes_revision_id", "user_id"]
            isOneToOne: false
            referencedRelation: "document_revisions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      job_artifacts: {
        Row: {
          agent: string
          artifact_type: string
          content: Json
          created_at: string | null
          id: string
          job_id: string
          user_id: string
          version: string
        }
        Insert: {
          agent: string
          artifact_type: string
          content: Json
          created_at?: string | null
          id?: string
          job_id: string
          user_id?: string
          version: string
        }
        Update: {
          agent?: string
          artifact_type?: string
          content?: Json
          created_at?: string | null
          id?: string
          job_id?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_artifacts_job_owner_fkey"
            columns: ["job_id", "user_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      job_matches: {
        Row: {
          agent: string | null
          agent_version: string | null
          concerns: string[]
          cons: string[] | null
          dealbreaker_hits: string[]
          gaps: string[] | null
          id: string
          job_id: string
          match_score: number
          pros: string[] | null
          reasoning: string | null
          recommendation: string
          resume_profile_id: string
          scored_at: string
          scores: Json | null
          skill_match_percentage: number | null
          strategic_advice: string | null
          user_id: string
          veto_reasons: string[] | null
        }
        Insert: {
          agent?: string | null
          agent_version?: string | null
          concerns?: string[]
          cons?: string[] | null
          dealbreaker_hits?: string[]
          gaps?: string[] | null
          id?: string
          job_id: string
          match_score: number
          pros?: string[] | null
          reasoning?: string | null
          recommendation: string
          resume_profile_id: string
          scored_at?: string
          scores?: Json | null
          skill_match_percentage?: number | null
          strategic_advice?: string | null
          user_id?: string
          veto_reasons?: string[] | null
        }
        Update: {
          agent?: string | null
          agent_version?: string | null
          concerns?: string[]
          cons?: string[] | null
          dealbreaker_hits?: string[]
          gaps?: string[] | null
          id?: string
          job_id?: string
          match_score?: number
          pros?: string[] | null
          reasoning?: string | null
          recommendation?: string
          resume_profile_id?: string
          scored_at?: string
          scores?: Json | null
          skill_match_percentage?: number | null
          strategic_advice?: string | null
          user_id?: string
          veto_reasons?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "job_matches_job_owner_fkey"
            columns: ["job_id", "user_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "job_matches_profile_owner_fkey"
            columns: ["resume_profile_id", "user_id"]
            isOneToOne: false
            referencedRelation: "resume_profile"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      job_revisions: {
        Row: {
          company: string
          content_hash: string
          created_at: string
          date_posted: string | null
          description: string
          id: string
          job_id: string
          location: string | null
          provider: string
          provider_external_id: string | null
          revision_number: number
          salary_range: string | null
          source_url: string
          title: string
          user_id: string
          work_arrangement: string | null
          work_type: string | null
        }
        Insert: {
          company: string
          content_hash: string
          created_at?: string
          date_posted?: string | null
          description: string
          id?: string
          job_id: string
          location?: string | null
          provider?: string
          provider_external_id?: string | null
          revision_number?: number
          salary_range?: string | null
          source_url: string
          title: string
          user_id?: string
          work_arrangement?: string | null
          work_type?: string | null
        }
        Update: {
          company?: string
          content_hash?: string
          created_at?: string
          date_posted?: string | null
          description?: string
          id?: string
          job_id?: string
          location?: string | null
          provider?: string
          provider_external_id?: string | null
          revision_number?: number
          salary_range?: string | null
          source_url?: string
          title?: string
          user_id?: string
          work_arrangement?: string | null
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_revisions_job_id_user_id_fkey"
            columns: ["job_id", "user_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      jobs: {
        Row: {
          company: string
          date_posted: string | null
          date_scraped: string
          description_snippet: string
          full_description: string | null
          id: string
          job_url: string
          location: string
          notes: string | null
          pipeline_status: string
          salary_range: string | null
          seek_job_id: string
          title: string
          updated_at: string | null
          user_id: string
          work_arrangement: string | null
          work_type: string | null
        }
        Insert: {
          company: string
          date_posted?: string | null
          date_scraped?: string
          description_snippet: string
          full_description?: string | null
          id?: string
          job_url: string
          location: string
          notes?: string | null
          pipeline_status?: string
          salary_range?: string | null
          seek_job_id: string
          title: string
          updated_at?: string | null
          user_id?: string
          work_arrangement?: string | null
          work_type?: string | null
        }
        Update: {
          company?: string
          date_posted?: string | null
          date_scraped?: string
          description_snippet?: string
          full_description?: string | null
          id?: string
          job_url?: string
          location?: string
          notes?: string | null
          pipeline_status?: string
          salary_range?: string | null
          seek_job_id?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          work_arrangement?: string | null
          work_type?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          endpoint: string
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          endpoint: string
          request_count?: number
          user_id: string
          window_start: string
        }
        Update: {
          endpoint?: string
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      resume_profile: {
        Row: {
          certifications: string[] | null
          education: string[] | null
          file_name: string | null
          file_path: string | null
          file_type: string | null
          id: string
          industries: string[] | null
          previous_titles: string[] | null
          raw_text: string
          skills_soft: string[] | null
          skills_technical: string[] | null
          summary: string | null
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          certifications?: string[] | null
          education?: string[] | null
          file_name?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          industries?: string[] | null
          previous_titles?: string[] | null
          raw_text: string
          skills_soft?: string[] | null
          skills_technical?: string[] | null
          summary?: string | null
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Update: {
          certifications?: string[] | null
          education?: string[] | null
          file_name?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          industries?: string[] | null
          previous_titles?: string[] | null
          raw_text?: string
          skills_soft?: string[] | null
          skills_technical?: string[] | null
          summary?: string | null
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      resume_revisions: {
        Row: {
          approved_at: string | null
          content_hash: string
          created_at: string
          id: string
          parser_version: string
          raw_text: string
          revision_number: number
          source_document_id: string | null
          structured_profile: Json
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          content_hash: string
          created_at?: string
          id?: string
          parser_version?: string
          raw_text: string
          revision_number: number
          source_document_id?: string | null
          structured_profile?: Json
          user_id?: string
        }
        Update: {
          approved_at?: string | null
          content_hash?: string
          created_at?: string
          id?: string
          parser_version?: string
          raw_text?: string
          revision_number?: number
          source_document_id?: string | null
          structured_profile?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_revisions_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "resume_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      search_profiles: {
        Row: {
          active: boolean
          adjacent_titles: string[]
          created_at: string
          dealbreakers: string[]
          employment_types: string[]
          excluded_companies: string[]
          id: string
          industries: string[]
          locations: string[]
          name: string
          salary_min: number | null
          target_titles: string[]
          updated_at: string
          user_id: string
          version: number
          work_arrangements: string[]
        }
        Insert: {
          active?: boolean
          adjacent_titles?: string[]
          created_at?: string
          dealbreakers?: string[]
          employment_types?: string[]
          excluded_companies?: string[]
          id?: string
          industries?: string[]
          locations?: string[]
          name: string
          salary_min?: number | null
          target_titles?: string[]
          updated_at?: string
          user_id?: string
          version?: number
          work_arrangements?: string[]
        }
        Update: {
          active?: boolean
          adjacent_titles?: string[]
          created_at?: string
          dealbreakers?: string[]
          employment_types?: string[]
          excluded_companies?: string[]
          id?: string
          industries?: string[]
          locations?: string[]
          name?: string
          salary_min?: number | null
          target_titles?: string[]
          updated_at?: string
          user_id?: string
          version?: number
          work_arrangements?: string[]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      record_approval_decision: {
        Args: {
          _comment?: string
          _decision: string
          _entity_id: string
          _entity_type: string
          _expected_hash?: string
        }
        Returns: {
          approved_hash: string | null
          comment: string | null
          created_at: string
          decided_at: string
          decision: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
