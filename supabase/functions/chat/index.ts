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
    const { messages, receptionistId, userId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      throw new Error('Messages array is required');
    }

    if (!receptionistId) {
      throw new Error('Receptionist ID is required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch receptionist data with error handling
    const { data: receptionist, error: recError } = await supabase
      .from('receptionists')
      .select('name, business_name, business_type, business_info, tone, greeting_message, default_response, goal, system_prompt, knowledge_base, language, temperature')
      .eq('id', receptionistId)
      .maybeSingle();

    if (recError) {
      console.error('Error fetching receptionist:', recError);
      throw new Error('Failed to fetch receptionist data');
    }

    if (!receptionist) {
      throw new Error('Receptionist not found');
    }

    // Fetch FAQs
    const { data: faqs, error: faqError } = await supabase
      .from('receptionist_faqs')
      .select('question, answer')
      .eq('receptionist_id', receptionistId)
      .order('priority', { ascending: false });

    if (faqError) {
      console.error('Error fetching FAQs:', faqError);
    }

    // Build context/system prompt
    const businessInfoText = receptionist.business_info 
      ? (typeof receptionist.business_info === 'string' 
          ? receptionist.business_info 
          : JSON.stringify(receptionist.business_info, null, 2))
      : 'No additional business information provided';

    const faqsText = faqs && faqs.length > 0 
      ? faqs.map(faq => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n')
      : 'No FAQs available';

    const systemPrompt = `You are ${receptionist.name}, an AI receptionist for ${receptionist.business_name}${receptionist.business_type ? ` (${receptionist.business_type})` : ''}.

${receptionist.goal ? `# Goal\n${receptionist.goal}\n` : ''}
${receptionist.system_prompt ? `# Persona\n${receptionist.system_prompt}\n` : ''}
# Tone
${receptionist.tone || 'Professional and friendly'}

# Greeting
${receptionist.greeting_message || 'Hello! How can I help you today?'}

# Business Information
${receptionist.knowledge_base || businessInfoText}

# Frequently Asked Questions
${faqsText}

# Instructions
${receptionist.default_response ? `If you're unsure about something, respond: "${receptionist.default_response}"` : 'If unsure, politely ask the customer to provide more details or suggest they call for assistance.'}
- Always respond in ${receptionist.language || 'English'}
- Maintain a ${receptionist.tone || 'professional and friendly'} tone
- Be helpful and provide accurate information based on the business details and FAQs above`;

    console.log('Generating chat response with', messages.length, 'messages');

    // Get the last user message for logging
    const lastUserMessage = messages[messages.length - 1]?.content || '';

    // Call Lovable AI Gateway
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
          ...messages
        ],
        temperature: receptionist.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Lovable AI error:', response.status, errorBody);
      
      // Handle rate limiting
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      if (response.status === 402) {
        throw new Error('AI credits exhausted. Please add credits to continue.');
      }
      
      throw new Error(`AI Gateway error: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    const aiMessage = data.choices[0].message.content;

    console.log('Generated response:', aiMessage.substring(0, 100));

    // Log the conversation to chat_messages table
    if (userId && lastUserMessage) {
      try {
        // Log user message
        await supabase.from('chat_messages').insert({
          receptionist_id: receptionistId,
          user_id: userId,
          sender: 'user',
          message: lastUserMessage
        });

        // Log AI response
        await supabase.from('chat_messages').insert({
          receptionist_id: receptionistId,
          user_id: userId,
          sender: 'bot',
          message: aiMessage
        });

        console.log('Messages logged to database');
      } catch (logError) {
        console.error('Error logging messages:', logError);
        // Don't fail the request if logging fails
      }
    }

    return new Response(
      JSON.stringify({ reply: aiMessage }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
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
