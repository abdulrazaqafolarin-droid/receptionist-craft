import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SLOT_DURATION_MINUTES = 30;
const DAYS_AHEAD = 60;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")
    );

    const body = await req.json().catch(() => ({}));
    const targetReceptionistId = body.receptionistId || null;

    console.log(`[generate-slots] Starting slot generation. Target: ${targetReceptionistId || 'all receptionists'}`);

    // Fetch all availability rules (or for a specific receptionist)
    let rulesQuery = supabase
      .from("availability_rules")
      .select("*, receptionists!inner(id, active, timezone)")
      .eq("receptionists.active", true);

    if (targetReceptionistId) {
      rulesQuery = rulesQuery.eq("receptionist_id", targetReceptionistId);
    }

    const { data: rules, error: rulesErr } = await rulesQuery;
    if (rulesErr) throw new Error(`Failed to fetch rules: ${rulesErr.message}`);
    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No availability rules found", slotsGenerated: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group rules by receptionist
    const rulesByReceptionist = new Map<string, typeof rules>();
    for (const rule of rules) {
      const rid = rule.receptionist_id;
      if (!rulesByReceptionist.has(rid)) rulesByReceptionist.set(rid, []);
      rulesByReceptionist.get(rid)!.push(rule);
    }

    const now = new Date();
    const endDate = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
    let totalSlotsGenerated = 0;

    for (const [receptionistId, receptionistRules] of rulesByReceptionist) {
      // Use the timezone from availability_rules (set by business owner)
      // Fall back to receptionist timezone, then UTC
      const businessTz = receptionistRules[0]?.timezone || 
                          (receptionistRules[0] as any)?.receptionists?.timezone || 
                          'UTC';

      console.log(`[generate-slots] Processing receptionist ${receptionistId}, tz=${businessTz}`);

      // Fetch existing booked appointments for collision detection
      const { data: appointments } = await supabase
        .from("appointments")
        .select("start_time, end_time, status")
        .eq("receptionist_id", receptionistId)
        .neq("status", "cancelled")
        .gte("start_time", now.toISOString())
        .lte("end_time", endDate.toISOString());

      // Fetch exceptions
      const { data: exceptions } = await supabase
        .from("availability_exceptions")
        .select("start_timestamptz, end_timestamptz")
        .eq("receptionist_id", receptionistId)
        .gte("end_timestamptz", now.toISOString())
        .lte("start_timestamptz", endDate.toISOString());

      // Delete existing future slots for this receptionist (regenerate fresh)
      await supabase
        .from("appointment_slots")
        .delete()
        .eq("receptionist_id", receptionistId)
        .gte("start_time", now.toISOString());

      // Generate slots day by day
      const slotsToInsert: Array<Record<string, unknown>> = [];
      const currentDay = new Date(now);
      currentDay.setHours(0, 0, 0, 0);

      while (currentDay < endDate) {
        const dayOfWeek = currentDay.getDay();
        const dayRules = receptionistRules.filter(r => Number(r.day_of_week) === dayOfWeek);

        for (const rule of dayRules) {
          const [startH, startM] = (rule.start_time || "09:00").split(":").map(Number);
          const [endH, endM] = (rule.end_time || "17:00").split(":").map(Number);

          // Build slot times in business timezone context
          // We construct local times and store as UTC
          const year = currentDay.getFullYear();
          const month = String(currentDay.getMonth() + 1).padStart(2, '0');
          const day = String(currentDay.getDate()).padStart(2, '0');

          let slotStart = new Date(`${year}-${month}-${day}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`);
          const dayEnd = new Date(`${year}-${month}-${day}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`);

          while (slotStart < dayEnd) {
            const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MINUTES * 60000);
            if (slotEnd > dayEnd) break;

            // Skip past slots
            if (slotStart > now) {
              // Check exception collisions
              const hasException = (exceptions || []).some((ex: any) => {
                const exStart = new Date(ex.start_timestamptz);
                const exEnd = new Date(ex.end_timestamptz);
                return !(slotEnd <= exStart || slotStart >= exEnd);
              });

              // Check appointment collisions
              const hasCollision = (appointments || []).some((appt: any) => {
                const apptStart = new Date(appt.start_time);
                const apptEnd = new Date(appt.end_time);
                return !(slotEnd <= apptStart || slotStart >= apptEnd);
              });

              slotsToInsert.push({
                receptionist_id: receptionistId,
                start_time: slotStart.toISOString(),
                end_time: slotEnd.toISOString(),
                is_available: !hasException && !hasCollision,
                metadata: {
                  business_timezone: businessTz,
                  generated_at: now.toISOString(),
                },
              });
            }

            slotStart = new Date(slotStart.getTime() + SLOT_DURATION_MINUTES * 60000);
          }
        }

        currentDay.setDate(currentDay.getDate() + 1);
      }

      // Batch insert (Supabase handles up to ~1000 rows per insert)
      const BATCH_SIZE = 500;
      for (let i = 0; i < slotsToInsert.length; i += BATCH_SIZE) {
        const batch = slotsToInsert.slice(i, i + BATCH_SIZE);
        const { error: insertErr } = await supabase
          .from("appointment_slots")
          .insert(batch);

        if (insertErr) {
          console.error(`[generate-slots] Batch insert error:`, insertErr.message);
        }
      }

      totalSlotsGenerated += slotsToInsert.length;
      console.log(`[generate-slots] Generated ${slotsToInsert.length} slots for ${receptionistId}`);
    }

    console.log(`[generate-slots] Complete. Total slots: ${totalSlotsGenerated}`);

    return new Response(
      JSON.stringify({
        success: true,
        slotsGenerated: totalSlotsGenerated,
        receptionistsProcessed: rulesByReceptionist.size,
        daysAhead: DAYS_AHEAD,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[generate-slots] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
