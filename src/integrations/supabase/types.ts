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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
