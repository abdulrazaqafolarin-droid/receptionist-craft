import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRole || !anonKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, serviceRole);

    await supabase.rpc("cron.unschedule", { job_name: "meo-analytics-every-30m" });

    const cronQuery = `
      SELECT cron.schedule(
        'meo-analytics-every-30m',
        '*/30 * * * *',
        $$
        SELECT net.http_post(
          url:='${supabaseUrl}/functions/v1/meo-analytics-runner',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}'::jsonb,
          body:='{}'::jsonb
        ) as request_id;
        $$
      );
    `;

    const { error: cronError } = await supabase.rpc("exec_sql", { sql: cronQuery });
    if (cronError) throw cronError;

    return new Response(
      JSON.stringify({ success: true, message: "MEO analytics cron set to run every 30 minutes." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Failed to configure MEO cron:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
