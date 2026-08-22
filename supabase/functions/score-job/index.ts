import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser, loadPreferences, UnauthorizedError } from "../_shared/auth.ts";
import { evaluateDealbreakers, type CandidatePreferences } from "../_shared/dealbreakers.ts";
import { bandLabel, resolvePolicy } from "../_shared/policy.ts";

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
  salary_range?: string | null;
  work_type?: string | null;
  work_arrangement?: string | null;
}

const AGENT_NAME = 'job_match_scorer';
const AGENT_VERSION = '1.1';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const list = (arr?: string[] | null) =>
  arr && arr.length > 0 ? arr.join(', ') : 'Not specified';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const user = await requireUser(req);

    const { job, profile } = await req.json() as { job: Job; profile: ResumeProfile };

    if (!job || !profile) {
      return json({ error: 'Job and profile are required' }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return json({ error: 'LOVABLE_API_KEY is not configured' }, 500);
    }

    // Preferences are always loaded server-side for the authenticated caller —
    // never taken from the request body.
    const prefs = (await loadPreferences(user.id)) as CandidatePreferences | null;
    const policy = resolvePolicy(prefs);

    // Deterministic dealbreaker pass. Runs before the model and is never
    // influenced by model output.
    const dealbreakerHits = evaluateDealbreakers(job, prefs);

    const jobDescription = job.full_description || job.description_snippet;

    const systemPrompt = `You are a senior technical recruiter with 15+ years of experience evaluating job-candidate fit.
Your role is to act as a DETERMINISTIC job-fit evaluator. You MUST:
- Base ALL conclusions strictly on provided evidence
- NEVER invent or assume experience not explicitly stated
- Give partial credit only for implicit/transferable skills
- Apply heavy penalties for missing must-have requirements
- Materially reduce scores for seniority mismatches
- When uncertain, ALWAYS downgrade the score

Hard dealbreakers are evaluated deterministically outside of your response. Do not
attempt to re-decide them; report softer worries in "concerns" instead.

You are NOT a resume writer or cover letter generator. You only evaluate fit.`;

    const prefsBlock = prefs
      ? `CANDIDATE GOALS AND CONSTRAINTS (weigh these heavily):
- Job goals: ${prefs.job_goals || 'Not specified'}
- Career direction: ${prefs.career_direction || 'Not specified'}
- Target titles: ${list(prefs.target_titles)}
- Target industries: ${list(prefs.target_industries)}
- Salary minimum: ${prefs.salary_min ?? 'Not specified'} ${prefs.currency ?? 'AUD'}
- Salary target: ${prefs.salary_target ?? 'Not specified'} ${prefs.currency ?? 'AUD'}
- Acceptable locations: ${list(prefs.locations)}
- Acceptable work arrangements: ${list(prefs.work_arrangements)}
- Acceptable employment types: ${list(prefs.work_types)}
- Verified experience (the only claims that may be treated as proven): ${prefs.verified_experience || 'Not specified'}
- Deterministic dealbreaker hits already detected: ${dealbreakerHits.length ? dealbreakerHits.join(' | ') : 'None'}`
      : 'CANDIDATE GOALS AND CONSTRAINTS: none saved yet — score on resume evidence alone.';

    const prompt = `Evaluate the job-candidate fit using this strict rubric:

SCORING RUBRIC (weights are FIXED):
- Hard Skills Alignment: 35% - Direct match of required technical skills
- Experience & Seniority: 30% - Years of experience and role level match
- Impact & Achievements: 20% - Demonstrated results aligned to role needs
- Education & Certifications: 10% - Required qualifications match
- Soft Skills & Culture: 5% - Communication, leadership, cultural indicators

CANDIDATE PROFILE:
- Technical Skills: ${list(profile.skills_technical)}
- Soft Skills: ${list(profile.skills_soft)}
- Years of Experience: ${profile.years_experience ?? 'Not specified'}
- Education: ${list(profile.education)}
- Certifications: ${list(profile.certifications)}
- Previous Roles: ${list(profile.previous_titles)}
- Industries: ${list(profile.industries)}
- Summary: ${profile.summary || 'Not provided'}

${prefsBlock}

JOB DETAILS:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Salary: ${job.salary_range || 'Not listed'}
- Employment type: ${job.work_type || 'Not listed'}
- Work arrangement: ${job.work_arrangement || 'Not listed'}
- Description: ${jobDescription}

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
  "skill_match_percentage": <0-100>,
  "veto_reasons": ["critical blocker evident in the resume vs the JD, if any"],
  "concerns": ["soft worry that is not a hard dealbreaker"],
  "evidence_gaps": ["missing evidence that prevented a higher score"],
  "pros": ["strength 1", "strength 2", "strength 3"],
  "cons": ["weakness 1", "weakness 2"],
  "reasoning": "2-3 concise sentences explaining the decision.",
  "strategic_advice": "1-2 realistic sentences for applying, or explanation why to skip."
}

Do NOT output a recommendation label or a final score — those are computed from the
rubric scores and the user's own score policy. Be realistic and honest. If uncertain
about experience claims, assume they are not present. Return ONLY the JSON object.`;

    console.log(`[${AGENT_NAME} v${AGENT_VERSION}] Scoring "${job.title}" at ${job.company} (dealbreakers: ${dealbreakerHits.length})`);

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
      const errorText = await aiResponse.text();
      console.error('[score-job] AI gateway error:', aiResponse.status, errorText);
      if (aiResponse.status === 429) {
        return json({ error: 'Rate limit exceeded. Please try again in a moment.' }, 429);
      }
      if (aiResponse.status === 402) {
        return json({ error: 'AI credits exhausted. Add credits in Lovable to continue.' }, 402);
      }
      if (aiResponse.status === 403) {
        return json({ error: 'AI access is blocked by workspace policy.' }, 403);
      }
      return json({ error: 'AI scoring failed' }, 502);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) return json({ error: 'No response from AI' }, 502);

    let matchResult: Record<string, unknown>;
    try {
      const cleanedContent = String(content).replace(/```json\n?|\n?```/g, '').trim();
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      matchResult = JSON.parse(jsonMatch ? jsonMatch[0] : cleanedContent);
    } catch {
      console.error('[score-job] Failed to parse AI response:', content);
      return json({ error: 'Failed to parse match data' }, 502);
    }

    const normalizeScore = (val: unknown) =>
      Math.min(100, Math.max(0, parseInt(String(val)) || 0));
    const arr = (v: unknown) =>
      Array.isArray(v) ? v.filter((x) => typeof x === 'string') as string[] : [];

    const rubric = (matchResult.scores ?? {}) as Record<string, unknown>;
    const scores = {
      hard_skills: normalizeScore(rubric.hard_skills),
      experience_seniority: normalizeScore(rubric.experience_seniority),
      impact: normalizeScore(rubric.impact),
      credentials: normalizeScore(rubric.credentials),
      soft_skills: normalizeScore(rubric.soft_skills),
    };

    let weightedScore = Math.round(
      scores.hard_skills * 0.35 +
      scores.experience_seniority * 0.30 +
      scores.impact * 0.20 +
      scores.credentials * 0.10 +
      scores.soft_skills * 0.05
    );

    // A deterministic dealbreaker caps the score below the Review band so the
    // role can never be recommended, regardless of what the model said.
    if (dealbreakerHits.length > 0) {
      weightedScore = Math.min(weightedScore, Math.max(0, policy.policy_review - 1));
    }

    const recommendation = bandLabel(weightedScore, policy);

    const match = {
      agent_meta: {
        agent: AGENT_NAME,
        version: AGENT_VERSION,
        alignment_check: 'ALIGNED',
      },
      scores,
      final_score: weightedScore,
      match_score: weightedScore,
      skill_match_percentage: normalizeScore(matchResult.skill_match_percentage),
      recommendation,
      policy,
      dealbreaker_hits: dealbreakerHits,
      concerns: arr(matchResult.concerns),
      veto_reasons: arr(matchResult.veto_reasons),
      evidence_gaps: arr(matchResult.evidence_gaps),
      pros: arr(matchResult.pros),
      cons: arr(matchResult.cons),
      reasoning: typeof matchResult.reasoning === 'string' ? matchResult.reasoning : '',
      strategic_advice:
        typeof matchResult.strategic_advice === 'string' ? matchResult.strategic_advice : '',
      gaps: arr(matchResult.evidence_gaps),
    };

    console.log(`[${AGENT_NAME} v${AGENT_VERSION}] Score: ${match.final_score} - ${match.recommendation}`);

    return json(match);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return json({ error: error.message }, 401);
    }
    console.error('[score-job] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to score job';
    return json({ error: errorMessage }, 500);
  }
});
