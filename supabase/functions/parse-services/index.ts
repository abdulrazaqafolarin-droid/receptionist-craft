import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, businessType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Please provide text describing your services and products" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Parsing services/products from text:", text.substring(0, 100));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert at extracting business services and products from natural language descriptions. 
            
Your task is to parse the user's input and identify:
1. SERVICES - Things that take time to perform (haircuts, consultations, repairs, massages, etc.)
2. PRODUCTS - Physical or digital items for sale (shirts, electronics, food items, etc.)

For each item, extract:
- name: A clear, concise name
- type: Either "service" or "product"
- duration_minutes: For services only, estimate a reasonable duration (15, 30, 45, 60, 90, 120 minutes typical)
- price: For products, extract the price if mentioned, otherwise estimate a reasonable price
- description: A brief description if context is provided

Be smart about categorization:
- "Haircut $25" → service with 30min duration
- "T-shirts $15 each" → product with price 15
- "1 hour massage" → service with 60min duration
- "Phone repair" → service with 60min duration
- "Coffee $5" → product with price 5

${businessType ? `The business type is: ${businessType}. Use this context to make better estimates.` : ''}

Return ONLY valid JSON in this exact format:
{
  "items": [
    {
      "name": "string",
      "type": "service" | "product",
      "duration_minutes": number (only for services),
      "price": number (only for products),
      "description": "string"
    }
  ]
}`
          },
          {
            role: "user",
            content: text
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_services_products",
              description: "Extract and categorize services and products from user text",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Name of the service or product" },
                        type: { type: "string", enum: ["service", "product"], description: "Whether this is a service or product" },
                        duration_minutes: { type: "number", description: "Duration in minutes (for services only)" },
                        price: { type: "number", description: "Price in dollars (for products only)" },
                        description: { type: "string", description: "Brief description" }
                      },
                      required: ["name", "type"]
                    }
                  }
                },
                required: ["items"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_services_products" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Service temporarily unavailable. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data).substring(0, 500));

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("Failed to parse AI response");
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    
    // Validate and clean up the items
    const items = (parsed.items || []).map((item: any) => ({
      name: item.name?.trim() || "Unknown Item",
      type: item.type === "product" ? "product" : "service",
      duration_minutes: item.type === "service" ? (item.duration_minutes || 60) : 0,
      price: item.type === "product" ? (item.price || 0) : undefined,
      description: item.description?.trim() || "",
      active: true
    }));

    console.log(`Successfully parsed ${items.length} items`);

    return new Response(
      JSON.stringify({ items }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in parse-services function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to parse services" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
