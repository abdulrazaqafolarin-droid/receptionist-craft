// supabase/functions/appointment-action/index.ts
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://esm.sh/zod@3.21.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const schema = z.object({
      action: z.enum(["confirm", "cancel"]),
      appointment_id: z.string().uuid(),
      reason: z.string().optional().nullable(),
    });
    const parsed = schema.parse(body);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, appointment_id, reason } = parsed;
    if (action === "confirm") {
      const { error } = await supabase.from("appointments").update({ status: "confirmed" }).eq("id", appointment_id);
      if (error) throw error;
      // Notification
      await supabase.from("notifications").insert({
        type: "appointment.confirmed",
        title: "Appointment confirmed",
        body: `Appointment ${appointment_id} confirmed.`,
        receptionist_id: null,
        metadata: { appointment_id },
        severity: "info",
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      const { error } = await supabase.from("appointments").update({ status: "cancelled", metadata: { cancelled_reason: reason } }).eq("id", appointment_id);
      if (error) throw error;
      await supabase.from("notifications").insert({
        type: "appointment.cancelled",
        title: "Appointment cancelled",
        body: `Appointment ${appointment_id} was cancelled.`,
        metadata: { appointment_id, reason },
        severity: "warning",
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err: any) {
    console.error("appointment-action error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
