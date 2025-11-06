import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatMessage {
  receptionist_id: string
  user_message: string
  bot_message?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { action, receptionist_id, user_message } = await req.json()

    // Get chat history
    if (action === 'get_history') {
      console.log('Fetching chat history for receptionist:', receptionist_id)
      
      const { data: conversations, error } = await supabaseClient
        .from('conversations')
        .select('*')
        .eq('receptionist_id', receptionist_id)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching conversations:', error)
        throw error
      }

      return new Response(
        JSON.stringify({ conversations }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send message and get AI reply
    if (action === 'send_message') {
      console.log('Processing message for receptionist:', receptionist_id)
      
      // Get receptionist details
      const { data: receptionist, error: recError } = await supabaseClient
        .from('receptionists')
        .select('*')
        .eq('id', receptionist_id)
        .single()

      if (recError) {
        console.error('Error fetching receptionist:', recError)
        throw recError
      }

      // Get recent conversation history for context
      const { data: recentConversations } = await supabaseClient
        .from('conversations')
        .select('user_message, bot_message')
        .eq('receptionist_id', receptionist_id)
        .order('created_at', { ascending: false })
        .limit(5)

      // Generate AI reply (mock logic for now - can be replaced with actual AI)
      const botReply = generateMockReply(user_message, receptionist, recentConversations || [])

      // Save conversation
      const { data: conversation, error: saveError } = await supabaseClient
        .from('conversations')
        .insert({
          receptionist_id,
          user_message,
          bot_message: botReply,
          direction: 'inbound',
          metadata: { timestamp: new Date().toISOString() }
        })
        .select()
        .single()

      if (saveError) {
        console.error('Error saving conversation:', saveError)
        throw saveError
      }

      console.log('Conversation saved successfully')

      return new Response(
        JSON.stringify({ bot_message: botReply, conversation }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Clear chat history
    if (action === 'clear_history') {
      console.log('Clearing history for receptionist:', receptionist_id)
      
      const { error } = await supabaseClient
        .from('conversations')
        .delete()
        .eq('receptionist_id', receptionist_id)

      if (error) {
        console.error('Error clearing conversations:', error)
        throw error
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in chat-with-receptionist function:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function generateMockReply(
  userMessage: string, 
  receptionist: any, 
  recentConversations: any[]
): string {
  const msg = userMessage.toLowerCase()
  const tone = receptionist.tone || 'friendly'
  const businessName = receptionist.business_name || 'our business'
  
  // Check for greetings
  if (msg.match(/^(hi|hello|hey|good morning|good afternoon)/)) {
    return applyTone(
      receptionist.greeting_message || `Hello! Welcome to ${businessName}. How can I assist you today?`,
      tone
    )
  }
  
  // Check for hours/schedule
  if (msg.includes('hours') || msg.includes('open') || msg.includes('schedule')) {
    const hours = receptionist.hours_of_operation
    if (hours && Object.keys(hours).length > 0) {
      return applyTone(
        `Our hours of operation are: ${formatHours(hours)}. Is there anything else I can help you with?`,
        tone
      )
    }
    return applyTone(`We're here to serve you! Please let me know what you need.`, tone)
  }
  
  // Check for services
  if (msg.includes('service') || msg.includes('price') || msg.includes('cost')) {
    const services = receptionist.services_and_prices
    if (services && Array.isArray(services) && services.length > 0) {
      return applyTone(
        `Here are our services: ${formatServices(services)}. Would you like to book one of these?`,
        tone
      )
    }
    return applyTone(`Let me tell you about our services! How can I assist you?`, tone)
  }
  
  // Check for booking/appointment
  if (msg.includes('book') || msg.includes('appointment') || msg.includes('schedule')) {
    return applyTone(
      `I'd be happy to help you book an appointment! What service are you interested in, and what date works best for you?`,
      tone
    )
  }
  
  // Check for location/address
  if (msg.includes('where') || msg.includes('location') || msg.includes('address')) {
    if (receptionist.address) {
      return applyTone(
        `We're located at ${receptionist.address}. Looking forward to seeing you!`,
        tone
      )
    }
    return applyTone(`Please contact us for our location details!`, tone)
  }
  
  // Default response
  return applyTone(
    receptionist.default_response || 
    `Thank you for your message! I'm here to help. Could you please provide more details about what you need?`,
    tone
  )
}

function applyTone(message: string, tone: string): string {
  switch (tone) {
    case 'professional':
      return message.replace(/!+/g, '.').replace(/\?+/g, '?')
    case 'friendly':
      return message
    case 'casual':
      return message.replace(/\./g, '!').replace('Thank you', 'Thanks')
    default:
      return message
  }
}

function formatHours(hours: any): string {
  return Object.entries(hours)
    .map(([day, time]) => `${day}: ${time}`)
    .join(', ')
}

function formatServices(services: any[]): string {
  return services
    .map((s: any) => `${s.service} - $${s.price}`)
    .join(', ')
}
