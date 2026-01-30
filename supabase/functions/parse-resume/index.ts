import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName, fileType } = await req.json();

    if (!fileContent) {
      return new Response(
        JSON.stringify({ error: 'File content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Decode base64 content
    const binaryContent = base64Decode(fileContent);
    let rawText = '';

    // Extract text based on file type
    if (fileType === 'text/plain') {
      rawText = new TextDecoder().decode(binaryContent);
    } else if (fileType === 'application/pdf') {
      // For PDF, we'll send the raw content to AI for interpretation
      // In a production app, you'd use a PDF parsing library
      rawText = new TextDecoder('utf-8', { fatal: false }).decode(binaryContent);
      // Clean up binary artifacts
      rawText = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
                       .replace(/\s+/g, ' ')
                       .trim();
    } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // For DOCX, extract text content (simplified)
      rawText = new TextDecoder('utf-8', { fatal: false }).decode(binaryContent);
      // Try to extract readable text
      rawText = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
                       .replace(/<[^>]*>/g, ' ')
                       .replace(/\s+/g, ' ')
                       .trim();
    }

    if (!rawText || rawText.length < 50) {
      return new Response(
        JSON.stringify({ 
          error: 'Could not extract text from file. Please ensure the file contains readable text (not a scanned image).' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Extracted ${rawText.length} characters from ${fileName}`);

    // Use Lovable AI to parse the resume
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
            content: `You are a resume parsing expert. Extract structured information from resumes and return valid JSON only. Be thorough in identifying skills, experience, and qualifications.`
          },
          {
            role: 'user',
            content: `Analyze this resume and extract structured information. Return a JSON object with these exact fields:
{
  "skills_technical": ["skill1", "skill2", ...],
  "skills_soft": ["skill1", "skill2", ...],
  "years_experience": <number or null if unclear>,
  "education": ["degree/qualification 1", "degree/qualification 2", ...],
  "certifications": ["cert1", "cert2", ...],
  "previous_titles": ["job title 1", "job title 2", ...],
  "industries": ["industry1", "industry2", ...],
  "summary": "2-3 sentence professional summary of the candidate"
}

Return ONLY the JSON object, no other text.

Resume text:
${rawText.substring(0, 8000)}`
          }
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
      throw new Error('AI analysis failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response
    let parsedProfile;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedProfile = JSON.parse(jsonMatch[0]);
      } else {
        parsedProfile = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse resume data');
    }

    // Validate and normalize the response
    const profile = {
      raw_text: rawText,
      skills_technical: Array.isArray(parsedProfile.skills_technical) ? parsedProfile.skills_technical : [],
      skills_soft: Array.isArray(parsedProfile.skills_soft) ? parsedProfile.skills_soft : [],
      years_experience: typeof parsedProfile.years_experience === 'number' ? parsedProfile.years_experience : null,
      education: Array.isArray(parsedProfile.education) ? parsedProfile.education : [],
      certifications: Array.isArray(parsedProfile.certifications) ? parsedProfile.certifications : [],
      previous_titles: Array.isArray(parsedProfile.previous_titles) ? parsedProfile.previous_titles : [],
      industries: Array.isArray(parsedProfile.industries) ? parsedProfile.industries : [],
      summary: typeof parsedProfile.summary === 'string' ? parsedProfile.summary : null,
    };

    console.log('Successfully parsed resume profile');

    return new Response(
      JSON.stringify(profile),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error parsing resume:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse resume';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
