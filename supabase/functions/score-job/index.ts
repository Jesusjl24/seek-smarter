import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ResumeProfile {
  skills_technical: string[];
  skills_soft: string[];
  years_experience: number | null;
  education: string[];
  certifications: string[];
  previous_titles: string[];
  industries: string[];
  summary: string | null;
}

interface Job {
  title: string;
  company: string;
  location: string;
  description_snippet: string;
  full_description?: string;
}

const AGENT_NAME = 'job_match_scorer';
const AGENT_VERSION = '1.0';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job, profile } = await req.json() as { job: Job; profile: ResumeProfile };

    if (!job || !profile) {
      return new Response(
        JSON.stringify({ error: 'Job and profile are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const jobDescription = job.full_description || job.description_snippet;

    const systemPrompt = `You are a senior technical recruiter with 15+ years of experience evaluating job-candidate fit.
Your role is to act as a DETERMINISTIC job-fit evaluator. You MUST:
- Base ALL conclusions strictly on provided evidence
- NEVER invent or assume experience not explicitly stated
- Give partial credit only for implicit/transferable skills
- Apply heavy penalties for missing must-have requirements
- Materially reduce scores for seniority mismatches
- When uncertain, ALWAYS downgrade the score

You are NOT a resume writer or cover letter generator. You only evaluate fit.`;

    const prompt = `Evaluate the job-candidate fit using this strict rubric:

SCORING RUBRIC (weights are FIXED):
- Hard Skills Alignment: 35% - Direct match of required technical skills
- Experience & Seniority: 30% - Years of experience and role level match
- Impact & Achievements: 20% - Demonstrated results aligned to role needs
- Education & Certifications: 10% - Required qualifications match
- Soft Skills & Culture: 5% - Communication, leadership, cultural indicators

CANDIDATE PROFILE:
- Technical Skills: ${profile.skills_technical.join(', ') || 'None specified'}
- Soft Skills: ${profile.skills_soft.join(', ') || 'None specified'}
- Years of Experience: ${profile.years_experience ?? 'Not specified'}
- Education: ${profile.education.join(', ') || 'None specified'}
- Certifications: ${profile.certifications.join(', ') || 'None'}
- Previous Roles: ${profile.previous_titles.join(', ') || 'None specified'}
- Industries: ${profile.industries.join(', ') || 'Not specified'}
- Summary: ${profile.summary || 'Not provided'}

JOB DETAILS:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Description: ${jobDescription}

RECOMMENDATION THRESHOLDS:
- 80-100: APPLY (Strong match)
- 60-79: CAUTIOUS_APPLY (Worth applying with tailoring)
- 0-59: DO_NOT_APPLY (Significant gaps, likely rejection)

Return a JSON object with these EXACT fields:
{
  "agent_meta": {
    "agent": "${AGENT_NAME}",
    "version": "${AGENT_VERSION}",
    "alignment_check": "ALIGNED"
  },
  "scores": {
    "hard_skills": <0-100>,
    "experience_seniority": <0-100>,
    "impact": <0-100>,
    "credentials": <0-100>,
    "soft_skills": <0-100>
  },
  "final_score": <0-100, weighted average>,
  "skill_match_percentage": <0-100>,
  "recommendation": "APPLY | CAUTIOUS_APPLY | DO_NOT_APPLY",
  "veto_reasons": ["reason if any critical blocker exists"],
  "evidence_gaps": ["missing evidence that prevented higher score"],
  "pros": ["strength 1", "strength 2", "strength 3"],
  "cons": ["weakness 1", "weakness 2"],
  "reasoning": "2-3 concise sentences explaining the decision.",
  "strategic_advice": "1-2 realistic sentences for applying, or explanation why to skip."
}

Be realistic and honest. If uncertain about experience claims, assume they are not present. Return ONLY the JSON object.`;

    console.log(`[${AGENT_NAME} v${AGENT_VERSION}] Scoring job: ${job.title} at ${job.company}`);

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
        temperature: 0.3,
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
      throw new Error('AI scoring failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response (handle markdown code fences)
    let matchResult;
    try {
      const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        matchResult = JSON.parse(jsonMatch[0]);
      } else {
        matchResult = JSON.parse(cleanedContent);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse match data');
    }

    // Validate and normalize the response
    const normalizeScore = (val: unknown) => Math.min(100, Math.max(0, parseInt(String(val)) || 0));
    
    const scores = {
      hard_skills: normalizeScore(matchResult.scores?.hard_skills),
      experience_seniority: normalizeScore(matchResult.scores?.experience_seniority),
      impact: normalizeScore(matchResult.scores?.impact),
      credentials: normalizeScore(matchResult.scores?.credentials),
      soft_skills: normalizeScore(matchResult.scores?.soft_skills),
    };

    // Calculate weighted final score
    const weightedScore = Math.round(
      scores.hard_skills * 0.35 +
      scores.experience_seniority * 0.30 +
      scores.impact * 0.20 +
      scores.credentials * 0.10 +
      scores.soft_skills * 0.05
    );

    // Determine recommendation based on thresholds
    let recommendation: string;
    if (weightedScore >= 80) {
      recommendation = 'APPLY';
    } else if (weightedScore >= 60) {
      recommendation = 'CAUTIOUS_APPLY';
    } else {
      recommendation = 'DO_NOT_APPLY';
    }

    const match = {
      agent_meta: {
        agent: AGENT_NAME,
        version: AGENT_VERSION,
        alignment_check: 'ALIGNED',
      },
      scores,
      final_score: weightedScore,
      match_score: weightedScore, // Legacy field for compatibility
      skill_match_percentage: normalizeScore(matchResult.skill_match_percentage),
      recommendation,
      veto_reasons: Array.isArray(matchResult.veto_reasons) ? matchResult.veto_reasons : [],
      evidence_gaps: Array.isArray(matchResult.evidence_gaps) ? matchResult.evidence_gaps : [],
      pros: Array.isArray(matchResult.pros) ? matchResult.pros : [],
      cons: Array.isArray(matchResult.cons) ? matchResult.cons : [],
      reasoning: matchResult.reasoning || '',
      strategic_advice: matchResult.strategic_advice || '',
      gaps: Array.isArray(matchResult.evidence_gaps) ? matchResult.evidence_gaps : [], // Legacy field
    };

    console.log(`[${AGENT_NAME} v${AGENT_VERSION}] Score: ${match.final_score}% - ${match.recommendation}`);

    return new Response(
      JSON.stringify(match),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scoring job:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to score job';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
