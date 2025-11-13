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
    const { text, voice = "alloy" } = await req.json();

    if (!text) {
      throw new Error('Text is required');
    }

    console.log('Generating speech for text:', text.substring(0, 50));

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

    let arrayBuffer: ArrayBuffer;

    // Try OpenAI TTS first
    if (OPENAI_API_KEY) {
      try {
        console.log('Using OpenAI TTS');
        const openaiResponse = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: text,
            voice: voice || 'alloy',
            response_format: 'mp3',
          }),
        });

        if (openaiResponse.ok) {
          arrayBuffer = await openaiResponse.arrayBuffer();
          console.log('Speech generated successfully with OpenAI');
        } else {
          const error = await openaiResponse.text();
          console.error('OpenAI TTS error:', error);
          throw new Error('OpenAI TTS failed');
        }
      } catch (openaiError) {
        console.log('OpenAI TTS failed, falling back to ElevenLabs');
        
        // Fall back to ElevenLabs
        if (!ELEVENLABS_API_KEY) {
          throw new Error('Both OPENAI_API_KEY and ELEVENLABS_API_KEY are not configured');
        }

        const voiceMap: Record<string, string> = {
          "alloy": "EXAVITQu4vr4xnSDxMaL",
          "echo": "CwhRBWXzGAHq8TQ4Fs17",
          "fable": "9BWtsMINqrJLrRacOk9x",
          "onyx": "IKne3meq5aSn9XLyUdCD",
          "nova": "FGY2WhTYpPnrIDTdsKH5",
          "shimmer": "XB0fDUnXU5powFXDhCwa",
          "Sarah": "EXAVITQu4vr4xnSDxMaL",
          "Rachel": "EXAVITQu4vr4xnSDxMaL",
          "Aria": "9BWtsMINqrJLrRacOk9x",
          "Roger": "CwhRBWXzGAHq8TQ4Fs17",
          "Laura": "FGY2WhTYpPnrIDTdsKH5",
          "Charlie": "IKne3meq5aSn9XLyUdCD",
        };

        const voiceId = voiceMap[voice] || voiceMap["alloy"];

        const elevenlabsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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

        if (!elevenlabsResponse.ok) {
          const error = await elevenlabsResponse.text();
          console.error('ElevenLabs API error:', error);
          throw new Error(`Failed to generate speech: ${error}`);
        }

        arrayBuffer = await elevenlabsResponse.arrayBuffer();
        console.log('Speech generated successfully with ElevenLabs');
      }
    } else if (ELEVENLABS_API_KEY) {
      // Use ElevenLabs directly if no OpenAI key
      console.log('Using ElevenLabs TTS');
      const voiceMap: Record<string, string> = {
        "alloy": "EXAVITQu4vr4xnSDxMaL",
        "echo": "CwhRBWXzGAHq8TQ4Fs17",
        "fable": "9BWtsMINqrJLrRacOk9x",
        "onyx": "IKne3meq5aSn9XLyUdCD",
        "nova": "FGY2WhTYpPnrIDTdsKH5",
        "shimmer": "XB0fDUnXU5powFXDhCwa",
        "Sarah": "EXAVITQu4vr4xnSDxMaL",
        "Rachel": "EXAVITQu4vr4xnSDxMaL",
        "Aria": "9BWtsMINqrJLrRacOk9x",
        "Roger": "CwhRBWXzGAHq8TQ4Fs17",
        "Laura": "FGY2WhTYpPnrIDTdsKH5",
        "Charlie": "IKne3meq5aSn9XLyUdCD",
      };

      const voiceId = voiceMap[voice] || voiceMap["alloy"];

      const elevenlabsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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

      if (!elevenlabsResponse.ok) {
        const error = await elevenlabsResponse.text();
        console.error('ElevenLabs API error:', error);
        throw new Error(`Failed to generate speech: ${error}`);
      }

      arrayBuffer = await elevenlabsResponse.arrayBuffer();
      console.log('Speech generated successfully with ElevenLabs');
    } else {
      throw new Error('No TTS API key configured (OPENAI_API_KEY or ELEVENLABS_API_KEY required)');
    }

    // Convert to base64
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    );

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
