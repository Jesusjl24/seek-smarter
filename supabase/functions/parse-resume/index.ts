import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser, UnauthorizedError } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    await requireUser(req);

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

    console.log(`Processing ${fileName} (${fileType})`);

    // For text files, decode directly
    let useVisionAPI = true;
    let textContent = '';
    
    if (fileType === 'text/plain') {
      try {
        const binaryContent = Uint8Array.from(atob(fileContent), c => c.charCodeAt(0));
        textContent = new TextDecoder().decode(binaryContent);
        useVisionAPI = false;
        console.log(`Extracted ${textContent.length} characters from TXT file`);
      } catch (e) {
        console.log('Failed to decode TXT, falling back to vision API');
        useVisionAPI = true;
      }
    }

    let parsedProfile;

    if (useVisionAPI) {
      // Use AI Vision to read PDF/DOCX documents
      // Gemini models support document understanding with base64 content
      console.log('Using AI Vision API for document parsing');

      // Determine the MIME type for the AI model
      let mimeType = fileType;
      if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // For DOCX, we'll send as application/pdf might work better, but let's try the actual type
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `You are a resume parsing expert. Extract structured information from resume documents and return valid JSON only. Be thorough in identifying skills, experience, and qualifications. Handle various resume formats including PDFs and Word documents.`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this resume document and extract structured information. Return a JSON object with these exact fields:
{
  "skills_technical": ["skill1", "skill2", ...],
  "skills_soft": ["skill1", "skill2", ...],
  "years_experience": <number or null if unclear>,
  "education": ["degree/qualification 1", "degree/qualification 2", ...],
  "certifications": ["cert1", "cert2", ...],
  "previous_titles": ["job title 1", "job title 2", ...],
  "industries": ["industry1", "industry2", ...],
  "summary": "2-3 sentence professional summary of the candidate",
  "raw_text": "Full extracted text from the document for reference"
}

Return ONLY the JSON object, no other text.`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${fileContent}`
                  }
                }
              ]
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
        console.error('AI Vision API error:', aiResponse.status, errorText);
        throw new Error('AI document analysis failed');
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No response from AI');
      }

      // Parse the JSON response
      try {
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
    } else {
      // Use text-based parsing for TXT files
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
${textContent.substring(0, 8000)}`
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
      try {
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

      // Add raw text for TXT files
      parsedProfile.raw_text = textContent;
    }

    // Validate and normalize the response
    const profile = {
      raw_text: parsedProfile.raw_text || textContent || 'Document parsed via AI Vision',
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
    if (error instanceof UnauthorizedError) {
      return new Response(JSON.stringify({ error: error.message }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.error('Error parsing resume:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse resume';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
