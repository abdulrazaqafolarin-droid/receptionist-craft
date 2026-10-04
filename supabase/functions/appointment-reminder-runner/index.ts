import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-platform-runtime, x-supabase-client-runtime-version',
};

/**
 * appointment-reminder-runner — fired hourly by pg_cron
 * ('appointment-reminders-24h', `0 * * * *`).
 *
 * Window math that actually works: the cron fires HOURLY, so each window is
 * one HOUR wide — [now + (h-1)h, now + h h]. A 1-minute window checked
 * hourly misses ~59/60 appointments; wide windows miss none.
 *
 * Per match, two deliveries:
 *   1. Owner notification (always) — upcoming booking on their dashboard.
 *   2. Customer email (when the appointment has customer_email AND
 *      RESEND_API_KEY is set) — the no-show reducer. Missing key or email
 *      skips silently with a warning, never an error.
 *
 * Dedupe: appointment_logs rows (action=reminder_sent, payload.window) —
 * a window is never sent twice for the same appointment, even if the cron
 * fires late or twice.
 */

interface ReminderWindow {
  label: string;
  hoursBefore: number;
}

const DEFAULT_WINDOWS: ReminderWindow[] = [
  { label: "24h", hoursBefore: 24 },
  { label: "1h", hoursBefore: 1 },
];

function parseWindows(params: Record<string, unknown>): ReminderWindow[] {
  if (Array.isArray(params.windows)) {
    const out: ReminderWindow[] = [];
    for (const w of params.windows as Array<Record<string, unknown>>) {
      const hours = Number(w?.hoursBefore);
      const label = typeof w?.label === "string" && w.label ? w.label : `${hours}h`;
      if (Number.isFinite(hours) && hours > 0 && hours <= 72) out.push({ label, hoursBefore: hours });
    }
    if (out.length > 0) return out.slice(0, 4);
  }
  // Legacy single-window body ({ minutesAhead }).
  if (params.minutesAhead !== undefined) {
    const mins = Number(params.minutesAhead);
    if (Number.isFinite(mins) && mins > 0) {
      return [{ label: `${Math.round(mins / 60)}h`, hoursBefore: mins / 60 }];
    }
  }
  return DEFAULT_WINDOWS;
}

async function sendCustomerEmail(
  to: string,
  businessName: string,
  service: string,
  startTime: string,
): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("[reminders] RESEND_API_KEY not configured, skipping customer email");
    return false;
  }
  try {
    const when = new Date(startTime).toLocaleString();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "bookings@aireceptionist.com",
        to,
        subject: `Reminder: ${service} at ${businessName}`,
        text: `Hi — a friendly reminder of your ${service} at ${businessName} on ${when}. Reply to this email if you need to reschedule.`,
      }),
    });
    if (!res.ok) {
      console.warn("[reminders] Resend rejected customer email:", res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[reminders] Customer email failed:", String(e).slice(0, 120));
    return false;
  }
}

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
    const windows = parseWindows(params as Record<string, unknown>);
    const now = new Date();

    let matched = 0;
    let ownerNotified = 0;
    let customerEmailed = 0;

    for (const w of windows) {
      const start = new Date(now.getTime() + (w.hoursBefore - 1) * 3600000).toISOString();
      const end = new Date(now.getTime() + w.hoursBefore * 3600000).toISOString();

      const { data: appts, error } = await supabase
        .from("appointments")
        .select("id, receptionist_id, service, customer_name, customer_email, customer_phone, start_time")
        .gte("start_time", start)
        .lt("start_time", end)
        .eq("status", "booked");

      if (error) {
        console.error(`[reminders] Fetch error (${w.label}):`, error);
        continue;
      }

      for (const a of appts || []) {
        matched++;

        // Dedupe: this window already sent for this appointment.
        const { data: already } = await supabase
          .from("appointment_logs")
          .select("id")
          .eq("appointment_id", a.id)
          .eq("action", "reminder_sent")
          .filter("payload->>window", "eq", w.label)
          .limit(1)
          .maybeSingle();
        if (already) continue;

        const { data: rec } = await supabase
          .from("receptionists")
          .select("user_id, business_name")
          .eq("id", a.receptionist_id)
          .maybeSingle();
        if (!rec?.user_id) {
          console.warn(`[reminders] Skipping ${a.id}: no owning user`);
          continue;
        }

        const businessName = rec.business_name || "your provider";

        // 1. Owner notification (always).
        const { error: notifErr } = await supabase.from("notifications").insert({
          type: "appointment.reminder",
          title: `Upcoming (${w.label}): ${a.service || 'Appointment'}`,
          message: `Appointment with ${a.customer_name} starting in about ${w.label}`,
          body: `Appointment with ${a.customer_name} at ${new Date(a.start_time).toLocaleString()}`,
          receptionist_id: a.receptionist_id,
          user_id: rec.user_id,
          severity: "info",
          priority: "normal",
          category: "appointments",
          metadata: { appointment_id: a.id, customer_phone: a.customer_phone, window: w.label }
        });
        if (!notifErr) ownerNotified++;

        // 2. Customer email (when addressable).
        let emailed = false;
        if (a.customer_email) {
          emailed = await sendCustomerEmail(a.customer_email, businessName, a.service || "appointment", a.start_time);
          if (emailed) customerEmailed++;
        }

        await supabase.from("appointment_logs").insert({
          appointment_id: a.id,
          action: "reminder_sent",
          actor_id: null,
          payload: {
            window: w.label,
            sent_at: new Date().toISOString(),
            owner_notified: !notifErr,
            customer_emailed: emailed,
          }
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, matched, ownerNotified, customerEmailed, windows: windows.map((w) => w.label) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[reminders] Server error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
