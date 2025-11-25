import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!supabaseUrl || !supabaseKey || !supabaseAnonKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if cron job already exists
    const { data: existing } = await supabase
      .rpc('cron.unschedule', { job_name: 'appointment-reminders-24h' })
      .throwOnError();

    console.log("Creating cron job for appointment reminders...");

    // Schedule the appointment reminder to run every hour
    const cronQuery = `
      SELECT cron.schedule(
        'appointment-reminders-24h',
        '0 * * * *',
        $$
        SELECT net.http_post(
          url:='${supabaseUrl}/functions/v1/appointment-reminder-runner',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${supabaseAnonKey}"}'::jsonb,
          body:='{"minutesAhead": 1440}'::jsonb
        ) as request_id;
        $$
      );
    `;

    const { error: cronError } = await supabase.rpc('exec_sql', { sql: cronQuery });

    if (cronError) {
      console.error("Cron setup error:", cronError);
      throw cronError;
    }

    console.log("Cron job created successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Appointment reminder cron job set up successfully. Runs every hour to send reminders 24h before appointments." 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Setup cron error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});