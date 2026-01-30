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

    const prompt = `Compare this job with the candidate's profile and provide a detailed match analysis.

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

Return a JSON object with these exact fields:
{
  "match_score": <0-100 integer>,
  "skill_match_percentage": <0-100 integer>,
  "recommendation": "<Strong Match|Good Match|Moderate Match|Weak Match>",
  "reasoning": "2-3 sentences explaining the score",
  "pros": ["pro1", "pro2", "pro3"],
  "cons": ["con1", "con2"],
  "gaps": ["missing skill/requirement 1", "missing skill/requirement 2"],
  "strategic_advice": "1-2 sentences of advice for applying to this role"
}

Be realistic and honest in your assessment. Return ONLY the JSON object.`;

    console.log(`Scoring job: ${job.title} at ${job.company}`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: 'You are a job matching expert. Analyze job-candidate fit and provide honest, actionable assessments. Return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
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
      throw new Error('AI scoring failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response
    let matchResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        matchResult = JSON.parse(jsonMatch[0]);
      } else {
        matchResult = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse match data');
    }

    // Validate and normalize
    const match = {
      match_score: Math.min(100, Math.max(0, parseInt(matchResult.match_score) || 50)),
      skill_match_percentage: Math.min(100, Math.max(0, parseInt(matchResult.skill_match_percentage) || 50)),
      recommendation: matchResult.recommendation || 'Moderate Match',
      reasoning: matchResult.reasoning || '',
      pros: Array.isArray(matchResult.pros) ? matchResult.pros : [],
      cons: Array.isArray(matchResult.cons) ? matchResult.cons : [],
      gaps: Array.isArray(matchResult.gaps) ? matchResult.gaps : [],
      strategic_advice: matchResult.strategic_advice || '',
    };

    console.log(`Match score: ${match.match_score}% - ${match.recommendation}`);

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
