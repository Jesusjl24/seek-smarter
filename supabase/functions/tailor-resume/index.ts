import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser, UnauthorizedError, loadPreferences } from "../_shared/auth.ts";
import { corsFor, originRejected, preflight } from "../_shared/cors.ts";
import { enforceRateLimit, readJsonBody, RateLimitError, PayloadTooLargeError } from "../_shared/ratelimit.ts";
import { DraftGenerationError, generateTailoredResumeDraft } from "../_shared/tailorDrafts.ts";

let corsHeaders: Record<string, string> = {};

interface ResumeProfile {
  skills_technical: string[];
  skills_soft: string[];
  years_experience: number | null;
  education: string[];
  certifications: string[];
  previous_titles: string[];
  industries: string[];
  summary: string | null;
  raw_text: string;
}

interface Job {
  title: string;
  company: string;
  location: string;
  description_snippet: string;
  full_description?: string;
}

const AGENT_NAME = 'resume_tailor';
const AGENT_VERSION = '1.0';

serve(async (req) => {
  corsHeaders = corsFor(req);
  if (originRejected(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (req.method === 'OPTIONS') {
    return preflight(req);
  }

  try {
    const user = await requireUser(req);
    await enforceRateLimit(user.id, 'tailor-resume', 10, 60);

    const { job, profile, match_score } = await readJsonBody<{
      job: Job;
      profile: ResumeProfile;
      match_score: number;
    }>(req, 512 * 1024);

    if (!job || !profile) {
      return new Response(
        JSON.stringify({ error: 'Job and profile are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Precondition: score must be >= 60
    if (typeof match_score !== 'number' || match_score < 60) {
      return new Response(
        JSON.stringify({ 
          error: 'Resume tailoring requires a match score of 60 or higher',
          current_score: match_score 
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const prefs = await loadPreferences(user.id);
    const tailoredResume = await generateTailoredResumeDraft({ job, profile, prefs, matchScore: match_score, apiKey: LOVABLE_API_KEY });
    return new Response(JSON.stringify(tailoredResume), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return new Response(JSON.stringify({ error: error.message }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (error instanceof RateLimitError) {
      return new Response(JSON.stringify({ error: error.message }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (error instanceof PayloadTooLargeError) {
      return new Response(JSON.stringify({ error: error.message }), { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (error instanceof DraftGenerationError) {
      return new Response(JSON.stringify({ error: error.message }), { status: error.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.error('Error tailoring resume:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to tailor resume';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
