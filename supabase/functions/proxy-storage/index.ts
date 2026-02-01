import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const fileUrl = url.searchParams.get('url');

    if (!fileUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing url parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL is from our Supabase storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!fileUrl.startsWith(supabaseUrl || '')) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL - must be from storage' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[proxy-storage] Fetching: ${fileUrl}`);

    // Fetch the file from storage
    const response = await fetch(fileUrl);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch file', status: response.status }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const fileData = await response.arrayBuffer();

    console.log(`[proxy-storage] Success - Content-Type: ${contentType}, Size: ${fileData.byteLength}`);

    return new Response(fileData, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': "frame-ancestors *",
      },
    });
  } catch (error) {
    console.error('Error proxying file:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Proxy error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
