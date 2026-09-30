import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callGeminiJSON(prompt: string): Promise<any> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        }
      })
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[parse-services] Gemini error:", res.status, err);
    if (res.status === 429) throw new Error("AI_RATE_LIMITED");
    throw new Error(`Gemini API failed: ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No content returned from Gemini");

  try {
    return JSON.parse(text);
  } catch {
    const clean = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(clean);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, businessType, filterType } = await req.json() as {
      text: string;
      businessType?: string;
      filterType?: "service" | "product";
    };

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Please provide text describing your services and products" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[parse-services] Parsing text:", text.substring(0, 100));

    const prompt = `You are an expert at extracting business services and products from natural language descriptions.

Your task is to parse the user's input and identify:
1. SERVICES - Things that take time to perform (haircuts, consultations, repairs, massages, etc.)
2. PRODUCTS - Physical or digital items for sale (shirts, electronics, food items, etc.)

For each item, extract:
- name: A clear, concise name
- type: Either "service" or "product"
- duration_minutes: For services only, estimate a reasonable duration (15, 30, 45, 60, 90, 120 minutes typical). Set to 0 if not specified.
- price: Extract the price if mentioned. If price is NOT mentioned, set to null (not 0).
- description: A brief description if context is provided

IMPORTANT: If a price is NOT explicitly written in the text, set price to null. Do NOT guess or estimate prices.

${businessType ? `The business type is: ${businessType}.` : ""}
${filterType === "service" ? "Only extract SERVICES. Ignore products entirely." : ""}
${filterType === "product" ? "Only extract PRODUCTS. Ignore services entirely." : ""}

Return ONLY valid JSON in this exact format:
{
  "items": [
    {
      "name": "string",
      "type": "service" or "product",
      "duration_minutes": number,
      "price": number or null,
      "description": "string"
    }
  ]
}

User input to parse:
${text}`;

    const parsed = await callGeminiJSON(prompt);

    const rawItems = (parsed.items || []) as any[];
    const scoped = filterType === "service" || filterType === "product"
      ? rawItems.filter((i) => i.type === filterType)
      : rawItems;

    const items = scoped.map((item: any) => ({
      name: item.name?.trim() || "Unknown Item",
      type: item.type === "product" ? "product" : "service",
      duration_minutes: item.type === "service" ? (item.duration_minutes || 0) : 0,
      price: item.price != null ? item.price : null,
      priceSpecified: item.price != null,
      description: item.description?.trim() || "",
      active: true,
    }));

    console.log(`[parse-services] Successfully parsed ${items.length} items`);

    return new Response(
      JSON.stringify({ items }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[parse-services] Error:", error);

    if ((error as Error).message === "AI_RATE_LIMITED") {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to parse services" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
