import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser, UnauthorizedError, loadPreferences } from "../_shared/auth.ts";
import { corsFor, originRejected, preflight } from "../_shared/cors.ts";
import { enforceRateLimit, readJsonBody, RateLimitError, PayloadTooLargeError } from "../_shared/ratelimit.ts";

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

    const { job, profile, match_score } = await req.json() as { 
      job: Job; 
      profile: ResumeProfile;
      match_score: number;
    };

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

    const jobDescription = job.full_description || job.description_snippet;

    const systemPrompt = `You are an expert resume consultant specializing in ATS optimization and recruiter psychology.
Your role is to provide TRUTHFUL, copy-paste-ready resume tailoring suggestions.

CRITICAL RULES:
- NEVER invent or fabricate experience, skills, or achievements
- Only REPHRASE, REORDER, and EMPHASIZE existing experience
- Highlight transferable skills HONESTLY
- All suggestions must be actionable and specific
- Focus on keyword alignment for ATS systems`;

    const prefs = await loadPreferences(user.id);
    const prefsBlock = prefs
      ? `CANDIDATE CONSTRAINTS AND GOALS (respect these; never contradict them):
- Job goals: ${prefs.job_goals || 'Not specified'}
- Career direction: ${prefs.career_direction || 'Not specified'}
- Target titles: ${(prefs.target_titles ?? []).join(', ') || 'Not specified'}
- Verified experience (the ONLY claims you may present as proven): ${prefs.verified_experience || 'Not specified'}
- Never invent experience, employers, metrics, or qualifications beyond the resume and the verified experience above.`
      : 'CANDIDATE CONSTRAINTS: none saved. Use only what the resume states; invent nothing.';

    const prompt = `${prefsBlock}

Generate tailored resume suggestions for this job application.

CANDIDATE'S CURRENT RESUME/PROFILE:
${profile.raw_text || `
Technical Skills: ${profile.skills_technical.join(', ') || 'None specified'}
Soft Skills: ${profile.skills_soft.join(', ') || 'None specified'}
Years of Experience: ${profile.years_experience ?? 'Not specified'}
Education: ${profile.education.join(', ') || 'None specified'}
Certifications: ${profile.certifications.join(', ') || 'None'}
Previous Roles: ${profile.previous_titles.join(', ') || 'None specified'}
Industries: ${profile.industries.join(', ') || 'Not specified'}
Summary: ${profile.summary || 'Not provided'}
`}

TARGET JOB:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Description: ${jobDescription}

Return a JSON object with these EXACT fields:
{
  "agent_meta": {
    "agent": "${AGENT_NAME}",
    "version": "${AGENT_VERSION}"
  },
  "target_role": {
    "title": "${job.title}",
    "company": "${job.company}"
  },
  "keywords_to_inject": ["keyword1", "keyword2", "keyword3"],
  "skills_to_emphasize": ["skill1", "skill2", "skill3"],
  "summary_rewrite": "2-3 line tailored professional summary for this specific role",
  "bullet_rewrites": [
    {
      "section": "Experience",
      "before": "Original phrasing from their resume",
      "after": "Rewritten bullet aligned to the job description",
      "why": "Brief explanation of why this improves ATS and recruiter signal"
    }
  ],
  "gap_mitigation": [
    {
      "gap": "Specific missing requirement from the job",
      "workaround": "Truthful positioning strategy to address this gap"
    }
  ],
  "final_notes": "1-2 sentences on how to tailor without misrepresentation"
}

Provide 3-5 bullet rewrites and 1-3 gap mitigations. Be specific and actionable. Return ONLY the JSON object.`;

    console.log(`[${AGENT_NAME} v${AGENT_VERSION}] Tailoring resume for: ${job.title} at ${job.company}`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error('AI tailoring failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response
    let result;
    try {
      const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(cleanedContent);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse tailoring data');
    }

    // Normalize the response
    const tailoredResume = {
      agent_meta: {
        agent: AGENT_NAME,
        version: AGENT_VERSION,
      },
      target_role: {
        title: job.title,
        company: job.company,
      },
      keywords_to_inject: Array.isArray(result.keywords_to_inject) ? result.keywords_to_inject : [],
      skills_to_emphasize: Array.isArray(result.skills_to_emphasize) ? result.skills_to_emphasize : [],
      summary_rewrite: result.summary_rewrite || '',
      bullet_rewrites: Array.isArray(result.bullet_rewrites) ? result.bullet_rewrites : [],
      gap_mitigation: Array.isArray(result.gap_mitigation) ? result.gap_mitigation : [],
      final_notes: result.final_notes || '',
    };

    console.log(`[${AGENT_NAME} v${AGENT_VERSION}] Generated ${tailoredResume.bullet_rewrites.length} bullet rewrites`);

    return new Response(
      JSON.stringify(tailoredResume),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return new Response(JSON.stringify({ error: error.message }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.error('Error tailoring resume:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to tailor resume';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
