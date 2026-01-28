import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { callId, filePath } = await req.json();

    if (!callId || !filePath) {
      return new Response(
        JSON.stringify({ error: 'Missing callId or filePath' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Downloading audio file:', filePath);

    // Download the audio file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('call-recordings')
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('Failed to download file:', downloadError);
      throw new Error('Failed to download audio file');
    }

    console.log('File downloaded, size:', fileData.size);

    // For now, since we don't have a dedicated transcription service,
    // we'll use Gemini's audio understanding capabilities
    // Convert the audio to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Determine MIME type from file extension
    const extension = filePath.split('.').pop()?.toLowerCase() || 'mp3';
    const mimeTypes: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'webm': 'audio/webm',
      'm4a': 'audio/mp4',
      'ogg': 'audio/ogg',
      'mp4': 'audio/mp4',
    };
    const mimeType = mimeTypes[extension] || 'audio/mpeg';

    console.log('Sending to AI for transcription...');

    // Use Gemini to transcribe (it has audio understanding)
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please transcribe this audio recording of a sales call. Format it as a conversation with speaker labels (Agent/Client) where you can distinguish speakers. Include all dialogue faithfully. If you cannot determine who is speaking, use "Speaker 1" and "Speaker 2". Provide only the transcript without any additional commentary.'
              },
              {
                type: 'input_audio',
                input_audio: {
                  data: base64Audio,
                  format: extension === 'wav' ? 'wav' : 'mp3'
                }
              }
            ]
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (aiResponse.status === 402) {
        throw new Error('AI credits exhausted. Please add more credits.');
      }
      throw new Error(`Transcription failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const transcript = aiData.choices?.[0]?.message?.content;

    if (!transcript) {
      throw new Error('No transcript received from AI');
    }

    console.log('Transcription completed, length:', transcript.length);

    return new Response(
      JSON.stringify({ success: true, transcript }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in transcribe-audio:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
