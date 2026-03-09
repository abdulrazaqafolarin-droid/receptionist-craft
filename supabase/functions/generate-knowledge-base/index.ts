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
    const { receptionistData } = await req.json();
    
    if (!receptionistData) {
      return new Response(
        JSON.stringify({ error: 'Receptionist data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build structured data summary
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

    // Call Lovable AI
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      throw new Error(`AI generation failed: ${response.status}`);
    }

    const aiData = await response.json();
    const generatedKnowledgeBase = aiData.choices?.[0]?.message?.content;

    if (!generatedKnowledgeBase) {
      throw new Error('No content generated from AI');
    }

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
