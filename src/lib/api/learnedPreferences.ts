import { isGuest } from "@/lib/guest";
import { apiGet, apiPost, apiPut } from "./client";

export type LearnedPreferences = {
  memo_text: string;
  generated_memo: string;
  like_summary: string;
  avoid_summary: string;
  aggregates?: any;
  user_edited?: boolean;
  updated_at?: string | null;
  last_learned_at?: string | null;
  recent?: Array<{ job_id: string; action: string; title?: string; company?: string; reason?: string | null }>;
};

const EMPTY: LearnedPreferences = { memo_text: "", generated_memo: "", like_summary: "", avoid_summary: "" };

export async function fetchLearnedPreferences() {
  if (isGuest()) return EMPTY;
  return apiGet<LearnedPreferences>("/api/learned-preferences");
}

export async function saveLearnedPreferences(memoText: string) {
  if (isGuest()) return { ...EMPTY, memo_text: memoText };
  return apiPut<LearnedPreferences>("/api/learned-preferences", { memo_text: memoText });
}

export async function resetLearnedPreferences() {
  if (isGuest()) return EMPTY;
  return apiPost<LearnedPreferences>("/api/learned-preferences/reset");
}
