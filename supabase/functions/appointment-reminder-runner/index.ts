import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")
    );

    const params = await req.json().catch(() => ({}));
    const minutesAhead = Number(params.minutesAhead ?? 15);

    const now = new Date();
    const start = new Date(now.getTime() + minutesAhead * 60000).toISOString();
    const end = new Date(now.getTime() + (minutesAhead + 1) * 60000).toISOString();

    console.log(`Checking appointments between ${start} and ${end}`);

    const { data: appts, error } = await supabase
      .from("appointments")
      .select("*")
      .gte("start_time", start)
      .lt("start_time", end)
      .eq("status", "booked");

    if (error) {
      console.error("Error fetching appointments:", error);
      throw error;
    }

    console.log(`Found ${appts?.length || 0} appointments`);

    const created: any[] = [];

    for (const a of appts || []) {
      // Resolve the receptionist owner — notifications.user_id is NOT NULL,
      // so we must attribute each reminder to the owning user.
      const { data: rec } = await supabase
        .from("receptionists")
        .select("user_id")
        .eq("id", a.receptionist_id)
        .maybeSingle();

      if (!rec?.user_id) {
        console.warn(`Skipping reminder for appointment ${a.id}: no owning user found`);
        continue;
      }

      const { data, error: insertErr } = await supabase
        .from("notifications")
        .insert({
          type: "appointment.reminder",
          title: `Upcoming: ${a.service || 'Appointment'}`,
          message: `Appointment with ${a.customer_name} starting soon`,
          body: `Appointment with ${a.customer_name} at ${new Date(a.start_time).toLocaleString()}`,
          receptionist_id: a.receptionist_id,
          user_id: rec.user_id,
          severity: "info",
          priority: "normal",
          category: "appointments",
          metadata: { appointment_id: a.id, customer_phone: a.customer_phone }
        })
        .select()
        .single();

      if (insertErr) {
        console.error("Error creating notification:", insertErr);
      } else {
        console.log(`Created reminder for appointment ${a.id}`);
        created.push(data);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        appointmentsFound: appts?.length || 0,
        remindersCreated: created.length, 
        reminders: created 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Server error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
