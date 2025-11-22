# Appointment Reminders Setup Guide

## Overview

The appointment reminder system sends automated reminders to business owners 24 hours before scheduled appointments via in-app notifications and browser push notifications.

---

## Current Implementation

### Edge Function

**File**: `supabase/functions/send-reminder/index.ts`

**Purpose**: Sends reminder for a specific appointment

**What it does**:
1. Fetches appointment details from database
2. Creates in-app notification for business owner
3. Logs the reminder action
4. Returns success/error response

**Trigger**: Must be called with `appointmentId` parameter

---

## ⚠️ Missing Component: Scheduler

The `send-reminder` edge function exists, but **there is no automated scheduler** to call it daily and find appointments that need reminders.

### What's Needed

You need to set up a scheduled task (cron job) that:
1. Runs once per day (e.g., at 9:00 AM)
2. Queries for appointments happening 24 hours from now
3. Calls `send-reminder` for each appointment

---

## Setup Options

### Option 1: Supabase pg_cron (Recommended)

Use Supabase's built-in PostgreSQL cron scheduler.

**Steps**:

1. Create a database function:

```sql
CREATE OR REPLACE FUNCTION schedule_appointment_reminders()
RETURNS void AS $$
DECLARE
  apt RECORD;
BEGIN
  -- Find appointments 24 hours from now (with some buffer)
  FOR apt IN 
    SELECT id, start_time
    FROM appointments
    WHERE status = 'booked'
    AND start_time >= NOW() + INTERVAL '23 hours'
    AND start_time <= NOW() + INTERVAL '25 hours'
    AND NOT EXISTS (
      SELECT 1 FROM appointment_logs 
      WHERE appointment_id = apt.id 
      AND action = 'reminder_sent'
    )
  LOOP
    -- Call edge function via pg_net
    PERFORM
      net.http_post(
        url := 'YOUR_SUPABASE_URL/functions/v1/send-reminder',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
        ),
        body := jsonb_build_object('appointmentId', apt.id)
      );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

2. Schedule it to run daily:

```sql
SELECT cron.schedule(
  'appointment-reminders-daily',
  '0 9 * * *', -- Every day at 9 AM
  'SELECT schedule_appointment_reminders();'
);
```

### Option 2: External Cron Service

Use an external service like:
- **Cron-job.org**
- **EasyCron**
- **Your own server's cron**

**Steps**:

1. Create a new edge function: `appointment-reminder-runner`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find appointments 24 hours from now
    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("id, start_time")
      .eq("status", "booked")
      .gte("start_time", new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString())
      .lte("start_time", new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString());

    if (error) throw error;

    const results = [];

    for (const apt of appointments || []) {
      // Check if reminder already sent
      const { data: logs } = await supabase
        .from("appointment_logs")
        .select("id")
        .eq("appointment_id", apt.id)
        .eq("action", "reminder_sent")
        .maybeSingle();

      if (logs) continue; // Already sent

      // Call send-reminder
      const { error: reminderError } = await supabase.functions.invoke("send-reminder", {
        body: { appointmentId: apt.id }
      });

      if (reminderError) {
        console.error(`Failed to send reminder for ${apt.id}:`, reminderError);
        results.push({ id: apt.id, status: "error", error: reminderError.message });
      } else {
        results.push({ id: apt.id, status: "success" });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: results.length, 
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
```

2. Configure external cron to hit: `YOUR_SUPABASE_URL/functions/v1/appointment-reminder-runner`

3. Set to run daily at desired time

### Option 3: GitHub Actions (Free)

Use GitHub Actions workflow:

**File**: `.github/workflows/appointment-reminders.yml`

```yaml
name: Daily Appointment Reminders

on:
  schedule:
    - cron: '0 9 * * *'  # 9 AM UTC daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  send-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Call reminder runner
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_KEY }}" \
            -H "Content-Type: application/json" \
            ${{ secrets.SUPABASE_URL }}/functions/v1/appointment-reminder-runner
```

**Setup**:
1. Add secrets to GitHub repository:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
2. Enable GitHub Actions
3. Workflow runs automatically daily

---

## Testing

### Manual Test

To test a reminder for a specific appointment:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"appointmentId": "APPOINTMENT_ID"}' \
  YOUR_SUPABASE_URL/functions/v1/send-reminder
```

### Test Full Runner

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  YOUR_SUPABASE_URL/functions/v1/appointment-reminder-runner
```

---

## Notification Flow

When reminder triggers:

1. **Edge function** executes
2. **Creates notification** in `notifications` table
3. **Realtime listener** (in Notifications page) detects new notification
4. **Browser push** appears (if user granted permission)
5. **In-app notification** shows in notification list

---

## Monitoring

### Check Logs

```sql
SELECT * FROM appointment_logs 
WHERE action = 'reminder_sent'
ORDER BY created_at DESC;
```

### Check Notifications

```sql
SELECT * FROM notifications 
WHERE type = 'appointment.reminder'
ORDER BY created_at DESC;
```

---

## Future Enhancements

1. **Email Reminders** - Send email alongside in-app notification
2. **SMS Reminders** - Text message to customer's phone
3. **Customizable Timing** - Let business owners set reminder timing (e.g., 24h, 2h, 1h before)
4. **Multiple Reminders** - Send multiple reminders per appointment
5. **Customer Reminders** - Remind customers, not just business owners
6. **Reminder Templates** - Customizable message templates

---

## Troubleshooting

### Reminders Not Sending

1. Check if scheduler is running
2. Verify appointments exist in next 24 hours
3. Check `appointment_logs` for duplicate reminder prevention
4. Review edge function logs
5. Confirm browser notification permissions

### Duplicate Reminders

- Check `appointment_logs` table for `reminder_sent` action
- Ensure scheduler only runs once per day
- Verify time window logic (23-25 hour buffer)
