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

const AGENT_NAME = 'cover_letter_writer';
const AGENT_VERSION = '1.0';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job, profile, match_score, tailored_highlights } = await req.json() as { 
      job: Job; 
      profile: ResumeProfile;
      match_score: number;
      tailored_highlights?: string[];
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
          error: 'Cover letter generation requires a match score of 60 or higher',
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

    const systemPrompt = `You are an expert career consultant specializing in Australian professional cover letters.
Your role is to write professional, concise, and role-specific cover letters.

CRITICAL RULES:
- Write in Australian English (favour, colour, organisation, etc.)
- Be CONCISE - Australian recruiters prefer direct communication
- NO FLUFF - every sentence must add value
- NEVER fabricate claims or experience
- Use confident but grounded tone
- Focus on what the candidate brings to the role
- Address specific job requirements`;

    const highlightsSection = tailored_highlights?.length 
      ? `\nKEY HIGHLIGHTS TO EMPHASIZE:\n${tailored_highlights.map(h => `- ${h}`).join('\n')}`
      : '';

    const prompt = `Write a professional Australian-style cover letter for this job application.

CANDIDATE PROFILE:
- Technical Skills: ${profile.skills_technical.join(', ') || 'None specified'}
- Soft Skills: ${profile.skills_soft.join(', ') || 'None specified'}
- Years of Experience: ${profile.years_experience ?? 'Not specified'}
- Education: ${profile.education.join(', ') || 'None specified'}
- Certifications: ${profile.certifications.join(', ') || 'None'}
- Previous Roles: ${profile.previous_titles.join(', ') || 'None specified'}
- Industries: ${profile.industries.join(', ') || 'Not specified'}
- Summary: ${profile.summary || 'Not provided'}
${highlightsSection}

TARGET JOB:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Description: ${jobDescription}

COVER LETTER STRUCTURE:
1. Opening: Express interest and mention where you found the role
2. Body (2-3 paragraphs): Connect your experience to their requirements
3. Closing: Call to action, availability for interview

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
  "cover_letter": "Full cover letter text with proper paragraphs. Use \\n\\n for paragraph breaks.",
  "key_points_used": ["point1", "point2", "point3"],
  "suggested_subject_lines": [
    "Application for ${job.title} - [Your Name]",
    "Experienced [Role] Seeking ${job.title} Opportunity"
  ],
  "final_checklist": [
    "Tailored to role",
    "Matches JD language",
    "No fabricated claims",
    "Australian English",
    "Concise and direct"
  ]
}

Write a compelling 250-350 word cover letter. Return ONLY the JSON object.`;

    console.log(`[${AGENT_NAME} v${AGENT_VERSION}] Generating cover letter for: ${job.title} at ${job.company}`);

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
        temperature: 0.5,
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
      throw new Error('AI cover letter generation failed');
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
      throw new Error('Failed to parse cover letter data');
    }

    // Normalize the response
    const coverLetter = {
      agent_meta: {
        agent: AGENT_NAME,
        version: AGENT_VERSION,
      },
      target_role: {
        title: job.title,
        company: job.company,
      },
      cover_letter: result.cover_letter || '',
      key_points_used: Array.isArray(result.key_points_used) ? result.key_points_used : [],
      suggested_subject_lines: Array.isArray(result.suggested_subject_lines) ? result.suggested_subject_lines : [],
      final_checklist: Array.isArray(result.final_checklist) ? result.final_checklist : [
        'Tailored to role',
        'Matches JD language',
        'No fabricated claims',
      ],
    };

    console.log(`[${AGENT_NAME} v${AGENT_VERSION}] Generated cover letter with ${coverLetter.key_points_used.length} key points`);

    return new Response(
      JSON.stringify(coverLetter),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating cover letter:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate cover letter';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
