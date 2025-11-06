import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages, receptionistId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      throw new Error('Messages array is required');
    }

    if (!receptionistId) {
      throw new Error('Receptionist ID is required');
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch receptionist data
    const { data: receptionist, error: recError } = await supabase
      .from('receptionists')
      .select('*')
      .eq('id', receptionistId)
      .single();

    if (recError || !receptionist) {
      throw new Error('Failed to fetch receptionist data');
    }

    // Fetch FAQs
    const { data: faqs } = await supabase
      .from('receptionist_faqs')
      .select('*')
      .eq('receptionist_id', receptionistId)
      .order('priority', { ascending: false });

    // Build enhanced system prompt with all receptionist configuration
    const systemPrompt = `You are ${receptionist.name}, an AI receptionist for ${receptionist.business_name}.

# Goal
${receptionist.goal || 'Assist customers with their inquiries and provide helpful information.'}

# Persona
${receptionist.system_prompt || `You are a ${receptionist.tone || 'professional and friendly'} receptionist.`}

# Business Info
${receptionist.knowledge_base || `
Business: ${receptionist.business_name}
Phone: ${receptionist.business_phone || 'Not provided'}
Address: ${receptionist.address || 'Not provided'}
Website: ${receptionist.website || 'Not provided'}
Hours: ${JSON.stringify(receptionist.hours_of_operation) || 'Not provided'}
Services: ${JSON.stringify(receptionist.services_and_prices) || 'Not provided'}
`}

# FAQs
${faqs && faqs.length > 0 ? faqs.map(faq => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n') : 'No FAQs available'}

# Tone
${receptionist.tone || 'Professional and friendly'}

# Rules
${receptionist.default_response ? `If unsure, respond: "${receptionist.default_response}"` : 'If unsure, politely ask the customer to call for more details.'}
Language: ${receptionist.language || 'English'}
${receptionist.greeting_message ? `Greeting: ${receptionist.greeting_message}` : ''}`;

    console.log('Generating chat response with', messages.length, 'messages');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        temperature: receptionist.temperature || 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiMessage = data.choices[0].message.content;

    console.log('Generated response:', aiMessage.substring(0, 100));

    return new Response(
      JSON.stringify({ reply: aiMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in chat function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate response' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
