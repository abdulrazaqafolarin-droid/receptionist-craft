import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text, voice = 'aura-asteria-en' } = await req.json();
    
    if (!text) {
      throw new Error('No text provided');
    }

    const DEEPGRAM_API_KEY = Deno.env.get('DEEPGRAM_API_KEY');
    
    if (!DEEPGRAM_API_KEY) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }

    console.log('Generating speech with Deepgram Aura...');

    // Call Deepgram TTS API
    const response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${voice}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Deepgram API error:', errorText);
      throw new Error(`Deepgram API error: ${errorText}`);
    }

    // Get audio buffer
    const audioBuffer = await response.arrayBuffer();
    console.log('Deepgram TTS successful, audio size:', audioBuffer.byteLength);

    // Convert audio buffer to base64
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(audioBuffer))
    );

    return new Response(
      JSON.stringify({ audioContent: base64Audio }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in text-to-speech:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
