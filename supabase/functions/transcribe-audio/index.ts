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

    const fileSize = fileData.size;
    console.log('File downloaded, size:', fileSize, 'bytes');

    // Check file size - edge functions have memory limits
    // For files larger than 10MB, we need to warn
    if (fileSize > 10 * 1024 * 1024) {
      throw new Error('Audio file is too large. Please upload files under 10MB.');
    }

    // Convert the audio to base64 - use chunked approach to avoid memory issues
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64 in chunks to avoid memory issues
    let base64Audio = '';
    const chunkSize = 32768; // 32KB chunks
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length));
      base64Audio += btoa(String.fromCharCode(...chunk));
    }

    console.log('Base64 encoded, length:', base64Audio.length);

    // Determine format from file extension
    const extension = filePath.split('.').pop()?.toLowerCase() || 'mp3';
    const formatMap: Record<string, string> = {
      'mp3': 'mp3',
      'wav': 'wav',
      'webm': 'webm',
      'm4a': 'mp3', // Gemini treats m4a as mp3 format
      'ogg': 'ogg',
      'mp4': 'mp3',
    };
    const format = formatMap[extension] || 'mp3';

    console.log('Sending to AI for transcription, format:', format);

    // Use Gemini to transcribe with proper input_audio format
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
                text: 'Please transcribe this audio recording word-for-word. This is a sales call recording. Format it as a conversation with speaker labels where you can distinguish speakers. Use the actual names mentioned in the conversation for speaker labels. Include all dialogue faithfully and accurately. Do not make up or invent any content - only transcribe what you actually hear in the audio. Provide only the transcript without any additional commentary.'
              },
              {
                type: 'input_audio',
                input_audio: {
                  data: base64Audio,
                  format: format
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
