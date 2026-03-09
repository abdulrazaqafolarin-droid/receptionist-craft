import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audio } = await req.json();
    
    // Input validation
    if (!audio || typeof audio !== 'string') {
      console.error('[VTT] Invalid audio data');
      throw new Error('Valid base64 audio data is required');
    }

    if (audio.length < 100) {
      console.error('[VTT] Audio data too short');
      throw new Error('Audio data appears to be too short');
    }

    const ASSEMBLYAI_API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY');
    
    if (!ASSEMBLYAI_API_KEY) {
      throw new Error('ASSEMBLYAI_API_KEY not configured');
    }

    console.log('[VTT] Processing audio transcription with AssemblyAI...');

    // Convert base64 to binary with error handling
    let binaryAudio: Uint8Array;
    try {
      binaryAudio = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
      console.log('[VTT] Audio decoded, size:', binaryAudio.length, 'bytes');
    } catch (decodeError) {
      console.error('[VTT] Failed to decode base64 audio:', decodeError);
      throw new Error('Invalid base64 audio format');
    }
    
    // Step 1: Upload audio file to AssemblyAI using Blob
    const blob = new Blob([binaryAudio as any], { type: 'application/octet-stream' });
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY,
      },
      body: blob,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('AssemblyAI upload error:', errorText);
      throw new Error(`AssemblyAI upload error: ${errorText}`);
    }

    const { upload_url } = await uploadResponse.json();
    console.log('Audio uploaded successfully');

    // Step 2: Create transcription job
    const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: upload_url,
        language_code: 'en',
      }),
    });

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      console.error('AssemblyAI transcript error:', errorText);
      throw new Error(`AssemblyAI transcript error: ${errorText}`);
    }

    const { id: transcriptId } = await transcriptResponse.json();
    console.log('Transcription job created:', transcriptId);

    // Step 3: Poll for transcription completion
    let transcriptResult;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max wait time

    while (attempts < maxAttempts) {
      const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: {
          'Authorization': ASSEMBLYAI_API_KEY,
        },
      });

      if (!pollResponse.ok) {
        throw new Error('Failed to poll transcription status');
      }

      transcriptResult = await pollResponse.json();

      if (transcriptResult.status === 'completed') {
        console.log('Transcription completed:', transcriptResult.text);
        break;
      } else if (transcriptResult.status === 'error') {
        throw new Error(`Transcription failed: ${transcriptResult.error}`);
      }

      // Wait 1 second before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.error('[VTT] Transcription timeout after', maxAttempts, 'attempts');
      throw new Error('Transcription timeout - please try again with a shorter audio clip');
    }

    return new Response(
      JSON.stringify({ text: transcriptResult.text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[VTT] Error in voice-to-text:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorDetails = error instanceof Error ? error.stack : undefined;
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorDetails 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
