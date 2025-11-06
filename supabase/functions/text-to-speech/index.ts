import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text, voice = "Sarah" } = await req.json();

    if (!text) {
      throw new Error('Text is required');
    }

    console.log('Generating speech for text:', text.substring(0, 50));

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    // Map voice names to ElevenLabs voice IDs
    const voiceMap: Record<string, string> = {
      "Sarah": "EXAVITQu4vr4xnSDxMaL",
      "Rachel": "EXAVITQu4vr4xnSDxMaL",
      "Aria": "9BWtsMINqrJLrRacOk9x",
      "Roger": "CwhRBWXzGAHq8TQ4Fs17",
      "Laura": "FGY2WhTYpPnrIDTdsKH5",
      "Charlie": "IKne3meq5aSn9XLyUdCD",
    };

    const voiceId = voiceMap[voice] || voiceMap["Sarah"];

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs API error:', error);
      throw new Error(`Failed to generate speech: ${error}`);
    }

    // Get audio as array buffer
    const arrayBuffer = await response.arrayBuffer();
    
    // Convert to base64
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    );

    console.log('Speech generated successfully');

    return new Response(
      JSON.stringify({ audioContent: base64Audio }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
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
