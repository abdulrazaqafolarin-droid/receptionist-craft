-- Migration: allow kpi_tick event type
-- Created: 2026-08-26 (Phase 5 analytics fix)
--
-- WHY: widget-chat persists per-message KPIs as conversion_events rows with
-- event_type='kpi_tick' (H6 pipeline), but this table's CHECK constraint was
-- never extended to accept it. Every KPI insert has failed with 23514 and been
-- silently swallowed by the warn-only catch — leaving RevenueEngine's MEO /
-- engagement analytics blind since launch.

ALTER TABLE public.conversion_events
  DROP CONSTRAINT conversion_events_event_type_check;

ALTER TABLE public.conversion_events
  ADD CONSTRAINT conversion_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'booking_completed'::text,
    'lead_captured'::text,
    'checkout_initiated'::text,
    'order_completed'::text,
    'kpi_tick'::text
  ]));
