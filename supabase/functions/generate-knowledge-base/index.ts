import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Gemini direct API call (replaces Lovable gateway) ───────────────────────
async function callGemini(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<string> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${systemPrompt}\n\n${userPrompt}` }
            ]
          }
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: 2048,
        }
      })
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[generate-knowledge-base] Gemini error:", res.status, err);
    throw new Error(`Gemini API failed: ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No content returned from Gemini");
  return text;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { receptionistData } = await req.json();

    if (!receptionistData) {
      return new Response(
        JSON.stringify({ error: 'Receptionist data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dataForAI = JSON.stringify(receptionistData, null, 2);

    const systemPrompt = `You are a smart system that rewrites structured business data into a clean, conversational, and professional knowledge base for use by an AI receptionist.

Your job is to transform raw form input into a natural-sounding summary that:
- Reflects the business's services, operations, and contact details
- Uses a warm, helpful, and human-like tone
- Is written clearly and concisely
- Omits irrelevant or empty fields
- Avoids repeating field names (like "Business name:" or "Phone:")
- Makes it easy for an AI to answer client questions

Write in complete sentences, using simple formatting (bullet points, line breaks) where useful.
Output ONLY the knowledge base text, no additional commentary.`;

    const userPrompt = `Here is the business data to rewrite into a conversational knowledge base:\n\n${dataForAI}`;

    const generatedKnowledgeBase = await callGemini(systemPrompt, userPrompt, 0.7);

    return new Response(
      JSON.stringify({ knowledge_base: generatedKnowledgeBase }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-knowledge-base:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
