import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""));

    if (action === "create_event") {
      const {
        receptionist_id,
        appointment_id,
        start_time,
        end_time,
        summary,
        description,
        attendees = [],
      } = body;

      const { data: creds } = await supabase
        .from("integrations_google")
        .select("access_token, refresh_token, expires_at")
        .eq("receptionist_id", receptionist_id)
        .maybeSingle();

      if (!creds || !creds.access_token) {
        return new Response(JSON.stringify({ error: "no_google_credentials" }), {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      const eventPayload = {
        summary,
        description,
        start: { dateTime: start_time },
        end: { dateTime: end_time },
        attendees: attendees.map((email: string) => ({ email })),
      };

      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventPayload),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("[google-calendar-sync] create event failed", txt);
        return new Response(JSON.stringify({ error: "google_calendar_create_failed", details: txt }), {
          status: 502,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      const event = await res.json();
      await supabase.from("appointments").update({ google_event_id: event.id }).eq("id", appointment_id);

      return new Response(JSON.stringify({ success: true, event }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("google-calendar-sync error", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
