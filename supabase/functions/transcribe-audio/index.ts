import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
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
    const { callId, filePath, filePaths } = await req.json();

    if (!callId || (!filePath && (!Array.isArray(filePaths) || filePaths.length === 0))) {
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

    const formatMap: Record<string, string> = {
      'mp3': 'mp3',
      'wav': 'wav',
      'webm': 'webm',
      'm4a': 'mp3',
      'ogg': 'ogg',
      'mp4': 'mp3',
      'json': 'mp3',
    };

    const resolvePaths = async (): Promise<string[]> => {
      if (Array.isArray(filePaths) && filePaths.length > 0) return filePaths;
      if (!filePath) throw new Error('Missing filePath');

      const ext = filePath.split('.').pop()?.toLowerCase();
      if (ext !== 'json') return [filePath];

      console.log('Downloading manifest:', filePath);
      const { data: manifestData, error: manifestErr } = await supabase.storage
        .from('call-recordings')
        .download(filePath);

      if (manifestErr || !manifestData) {
        console.error('Failed to download manifest:', manifestErr);
        throw new Error('Failed to download manifest');
      }

      const text = await manifestData.text();
      let manifest: any;
      try {
        manifest = JSON.parse(text);
      } catch {
        throw new Error('Invalid manifest JSON');
      }

      const chunks = manifest?.chunks;
      if (!Array.isArray(chunks) || chunks.some((p: any) => typeof p !== 'string')) {
        throw new Error('Manifest missing valid chunks array');
      }
      return chunks;
    };

    const paths = await resolvePaths();
    console.log('Transcribing segments:', paths.length);

    const transcripts: string[] = [];

    for (let idx = 0; idx < paths.length; idx++) {
      const currentPath = paths[idx];
      console.log('Downloading audio segment:', idx + 1, '/', paths.length, currentPath);

      const { data: fileData, error: downloadError } = await supabase.storage
        .from('call-recordings')
        .download(currentPath);

      if (downloadError || !fileData) {
        console.error('Failed to download file:', downloadError);
        throw new Error('Failed to download audio file');
      }

      const fileSize = fileData.size;
      console.log('Segment downloaded, size:', fileSize, 'bytes');

      // 5MB limit to stay within edge function memory constraints
      const MAX_SEGMENT_BYTES = 5 * 1024 * 1024;
      if (fileSize > MAX_SEGMENT_BYTES) {
        throw new Error(`Segment too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Max allowed is 5MB. Please re-upload with smaller chunks.`);
      }

      const arrayBuffer = await fileData.arrayBuffer();

      // Use proper Base64 encoder to avoid broken padding from chunked btoa
      const base64Audio = base64Encode(arrayBuffer);
      console.log('Base64 encoded length:', base64Audio.length, 'chars');

      const extension = currentPath.split('.').pop()?.toLowerCase() || 'mp3';
      const format = formatMap[extension] || 'mp3';

      console.log('Sending segment to AI for transcription, format:', format);

      const segmentPrompt =
        paths.length > 1
          ? `This is segment ${idx + 1} of ${paths.length} from a single sales call recording. ` +
            `Please transcribe this segment word-for-word. Format it as a conversation with speaker labels where you can distinguish speakers. ` +
            `Use the actual names mentioned in the conversation for speaker labels. ` +
            `Do not repeat earlier segments; just continue the transcript from this segment. ` +
            `Provide only the transcript for this segment without any additional commentary.`
          : 'Please transcribe this audio recording word-for-word. This is a sales call recording. Format it as a conversation with speaker labels where you can distinguish speakers. Use the actual names mentioned in the conversation for speaker labels. Include all dialogue faithfully and accurately. Do not make up or invent any content - only transcribe what you actually hear in the audio. Provide only the transcript without any additional commentary.';

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
                { type: 'text', text: segmentPrompt },
                {
                  type: 'input_audio',
                  input_audio: { data: base64Audio, format },
                },
              ],
            },
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
        
        // Detect common provider errors and provide clearer messages
        if (errorText.includes('Base64 decoding failed') || errorText.includes('invalid base64')) {
          throw new Error('Audio encoding error. Please try re-uploading the file.');
        }
        if (aiResponse.status === 413 || errorText.includes('too large')) {
          throw new Error('Audio segment too large for processing. Please try a shorter recording.');
        }
        
        // Include snippet of error for debugging
        const snippet = errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText;
        throw new Error(`Transcription failed (${aiResponse.status}): ${snippet}`);
      }

      const aiData = await aiResponse.json();
      const segmentTranscript = aiData.choices?.[0]?.message?.content;
      if (!segmentTranscript) {
        throw new Error('No transcript received from AI');
      }
      transcripts.push(String(segmentTranscript).trim());
    }

    const transcript = transcripts.filter(Boolean).join('\n\n');

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
