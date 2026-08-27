# Phase 7 — Human Escalation Path

## Problem
When the AI can't resolve something (complex objection, edge-case request, repeated confusion), it either loops infinitely, gives a bad answer, or fails silently. The customer gets stuck.

## Solution
A designed escalation flow:
1. **Detection** — AI signals escalation intent (via tool call or escalation intent in response)
2. **Capture** — Escalation event saved to `escalations` table with context
3. **Notification** — Owner notified via realtime subscription (dashboard shows live badge)
4. **Resolution** — Owner views escalation, takes action (responds directly or marks resolved)

## Schema

### escalations table
```sql
CREATE TABLE public.escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id),
  session_id TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  reason TEXT NOT NULL,        -- e.g. "repeated_confusion", "complex_objection", "request_human"
  summary TEXT,                -- AI-generated summary of the conversation so far
  status TEXT NOT NULL DEFAULT 'open',  -- open | acknowledged | resolved
  resolved_by TEXT,            -- owner user_id
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Changes

### Backend
- `escalations` table migration
- Widget-chat: detect escalation signals and create escalation record
- Owner dashboard: realtime subscription for new escalations

### Frontend
- `Escalations.tsx` — owner-facing list + detail view
- Route `/escalations` + sidebar link
- Badge on sidebar when open escalations exist
