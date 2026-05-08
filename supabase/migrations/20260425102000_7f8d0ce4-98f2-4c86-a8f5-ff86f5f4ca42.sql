-- Aggregate pipeline keyed by receptionist + interval bucket for revenue/conversion health metrics.

CREATE TABLE IF NOT EXISTS public.receptionist_interval_metrics (
  receptionist_id uuid NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  interval_bucket text NOT NULL CHECK (interval_bucket IN ('hour', 'day', 'week')),
  bucket_start timestamptz NOT NULL,
  bucket_end timestamptz NOT NULL,
  conversations_count integer NOT NULL DEFAULT 0,
  bookings_count integer NOT NULL DEFAULT 0,
  orders_count integer NOT NULL DEFAULT 0,
  leads_count integer NOT NULL DEFAULT 0,
  conversion_count integer NOT NULL DEFAULT 0,
  conversion_rate numeric(8,4) NOT NULL DEFAULT 0,
  revenue_total numeric(14,2) NOT NULL DEFAULT 0,
  no_show_count integer NOT NULL DEFAULT 0,
  missed_booking_recovery_count integer NOT NULL DEFAULT 0,
  missed_booking_recovery_revenue numeric(14,2) NOT NULL DEFAULT 0,
  after_hours_captures_count integer NOT NULL DEFAULT 0,
  revenue_leak_count integer NOT NULL DEFAULT 0,
  revenue_leak_value numeric(14,2) NOT NULL DEFAULT 0,
  leak_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (receptionist_id, interval_bucket, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_receptionist_interval_metrics_lookup
  ON public.receptionist_interval_metrics (interval_bucket, bucket_start DESC);

CREATE INDEX IF NOT EXISTS idx_receptionist_interval_metrics_receptionist
  ON public.receptionist_interval_metrics (receptionist_id, interval_bucket, bucket_start DESC);

ALTER TABLE public.receptionist_interval_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business owners can view receptionist interval metrics" ON public.receptionist_interval_metrics;
CREATE POLICY "Business owners can view receptionist interval metrics"
ON public.receptionist_interval_metrics
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.receptionists r
    WHERE r.id = receptionist_interval_metrics.receptionist_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Service role can manage receptionist interval metrics" ON public.receptionist_interval_metrics;
CREATE POLICY "Service role can manage receptionist interval metrics"
ON public.receptionist_interval_metrics
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.analytics_pipeline_state (
  pipeline_key text PRIMARY KEY,
  last_processed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analytics_pipeline_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage analytics pipeline state" ON public.analytics_pipeline_state;
CREATE POLICY "Service role can manage analytics pipeline state"
ON public.analytics_pipeline_state
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.refresh_receptionist_interval_metrics(
  p_since timestamptz DEFAULT now() - interval '30 days',
  p_until timestamptz DEFAULT now(),
  p_interval_bucket text DEFAULT 'day'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_upserted integer := 0;
BEGIN
  IF p_interval_bucket NOT IN ('hour', 'day', 'week') THEN
    RAISE EXCEPTION 'Unsupported interval bucket: %', p_interval_bucket;
  END IF;

  WITH conv AS (
    SELECT
      ce.receptionist_id,
      date_trunc(p_interval_bucket, ce.created_at) AS bucket_start,
      COUNT(*) FILTER (WHERE ce.event_type = 'booking_completed') AS bookings_count,
      COUNT(*) FILTER (WHERE ce.event_type = 'order_completed') AS orders_count,
      COUNT(*) FILTER (WHERE ce.event_type = 'lead_captured') AS leads_count,
      COUNT(*) FILTER (
        WHERE ce.event_type = 'missed_booking_recovered'
          OR COALESCE((ce.metadata->>'recovered_from_missed_booking')::boolean, false)
      ) AS missed_booking_recovery_count,
      COALESCE(SUM(ce.revenue_value) FILTER (
        WHERE ce.event_type = 'missed_booking_recovered'
          OR COALESCE((ce.metadata->>'recovered_from_missed_booking')::boolean, false)
      ), 0)::numeric(14,2) AS missed_booking_recovery_revenue,
      COUNT(*) FILTER (
        WHERE ce.event_type = 'after_hours_capture'
          OR COALESCE((ce.metadata->>'after_hours')::boolean, false)
      ) AS after_hours_captures_count,
      COUNT(*) FILTER (WHERE ce.event_type = 'revenue_leak') AS revenue_leak_count,
      COALESCE(SUM(ce.revenue_value) FILTER (WHERE ce.event_type = 'revenue_leak'), 0)::numeric(14,2) AS revenue_leak_value,
      COALESCE(
        SUM(ce.revenue_value) FILTER (WHERE ce.event_type IN ('booking_completed', 'order_completed')),
        0
      )::numeric(14,2) AS revenue_total
    FROM public.conversion_events ce
    WHERE ce.created_at >= p_since
      AND ce.created_at < p_until
    GROUP BY ce.receptionist_id, date_trunc(p_interval_bucket, ce.created_at)
  ),
  conv_leak_reasons AS (
    SELECT
      ce.receptionist_id,
      date_trunc(p_interval_bucket, ce.created_at) AS bucket_start,
      COALESCE(
        jsonb_object_agg(reason_key, reason_count)
          FILTER (WHERE reason_key IS NOT NULL),
        '{}'::jsonb
      ) AS leak_reasons
    FROM (
      SELECT
        receptionist_id,
        created_at,
        NULLIF(COALESCE(metadata->>'reason', metadata->>'leak_reason', 'unspecified'), '') AS reason_key,
        COUNT(*) AS reason_count
      FROM public.conversion_events
      WHERE event_type = 'revenue_leak'
        AND created_at >= p_since
        AND created_at < p_until
      GROUP BY receptionist_id, created_at, NULLIF(COALESCE(metadata->>'reason', metadata->>'leak_reason', 'unspecified'), '')
    ) ce
    GROUP BY ce.receptionist_id, date_trunc(p_interval_bucket, ce.created_at)
  ),
  convo AS (
    SELECT
      c.receptionist_id,
      date_trunc(p_interval_bucket, c.created_at) AS bucket_start,
      COUNT(*) AS conversations_count
    FROM public.conversations c
    WHERE c.created_at >= p_since
      AND c.created_at < p_until
    GROUP BY c.receptionist_id, date_trunc(p_interval_bucket, c.created_at)
  ),
  appt AS (
    SELECT
      a.receptionist_id,
      date_trunc(p_interval_bucket, a.created_at) AS bucket_start,
      COUNT(*) FILTER (
        WHERE a.status::text = 'no_show'
          OR (a.status = 'cancelled' AND COALESCE((a.metadata->>'no_show')::boolean, false))
      ) AS no_show_count
    FROM public.appointments a
    WHERE a.created_at >= p_since
      AND a.created_at < p_until
    GROUP BY a.receptionist_id, date_trunc(p_interval_bucket, a.created_at)
  ),
  unioned AS (
    SELECT receptionist_id, bucket_start FROM conv
    UNION
    SELECT receptionist_id, bucket_start FROM convo
    UNION
    SELECT receptionist_id, bucket_start FROM appt
  ),
  aggregated AS (
    SELECT
      u.receptionist_id,
      p_interval_bucket AS interval_bucket,
      u.bucket_start,
      CASE p_interval_bucket
        WHEN 'hour' THEN u.bucket_start + interval '1 hour'
        WHEN 'week' THEN u.bucket_start + interval '1 week'
        ELSE u.bucket_start + interval '1 day'
      END AS bucket_end,
      COALESCE(convo.conversations_count, 0) AS conversations_count,
      COALESCE(conv.bookings_count, 0) AS bookings_count,
      COALESCE(conv.orders_count, 0) AS orders_count,
      COALESCE(conv.leads_count, 0) AS leads_count,
      COALESCE(conv.bookings_count, 0) + COALESCE(conv.orders_count, 0) + COALESCE(conv.leads_count, 0) AS conversion_count,
      CASE
        WHEN COALESCE(convo.conversations_count, 0) = 0 THEN 0
        ELSE (
          (COALESCE(conv.bookings_count, 0) + COALESCE(conv.orders_count, 0))::numeric
          / convo.conversations_count::numeric
        )
      END AS conversion_rate,
      COALESCE(conv.revenue_total, 0)::numeric(14,2) AS revenue_total,
      COALESCE(appt.no_show_count, 0) AS no_show_count,
      COALESCE(conv.missed_booking_recovery_count, 0) AS missed_booking_recovery_count,
      COALESCE(conv.missed_booking_recovery_revenue, 0)::numeric(14,2) AS missed_booking_recovery_revenue,
      COALESCE(conv.after_hours_captures_count, 0) AS after_hours_captures_count,
      COALESCE(conv.revenue_leak_count, 0) AS revenue_leak_count,
      COALESCE(conv.revenue_leak_value, 0)::numeric(14,2) AS revenue_leak_value,
      COALESCE(conv_leak_reasons.leak_reasons, '{}'::jsonb) AS leak_reasons,
      now() AS source_updated_at
    FROM unioned u
    LEFT JOIN conv ON conv.receptionist_id = u.receptionist_id AND conv.bucket_start = u.bucket_start
    LEFT JOIN conv_leak_reasons ON conv_leak_reasons.receptionist_id = u.receptionist_id AND conv_leak_reasons.bucket_start = u.bucket_start
    LEFT JOIN convo ON convo.receptionist_id = u.receptionist_id AND convo.bucket_start = u.bucket_start
    LEFT JOIN appt ON appt.receptionist_id = u.receptionist_id AND appt.bucket_start = u.bucket_start
  )
  INSERT INTO public.receptionist_interval_metrics (
    receptionist_id,
    interval_bucket,
    bucket_start,
    bucket_end,
    conversations_count,
    bookings_count,
    orders_count,
    leads_count,
    conversion_count,
    conversion_rate,
    revenue_total,
    no_show_count,
    missed_booking_recovery_count,
    missed_booking_recovery_revenue,
    after_hours_captures_count,
    revenue_leak_count,
    revenue_leak_value,
    leak_reasons,
    source_updated_at,
    updated_at
  )
  SELECT
    receptionist_id,
    interval_bucket,
    bucket_start,
    bucket_end,
    conversations_count,
    bookings_count,
    orders_count,
    leads_count,
    conversion_count,
    conversion_rate,
    revenue_total,
    no_show_count,
    missed_booking_recovery_count,
    missed_booking_recovery_revenue,
    after_hours_captures_count,
    revenue_leak_count,
    revenue_leak_value,
    leak_reasons,
    source_updated_at,
    now()
  FROM aggregated
  ON CONFLICT (receptionist_id, interval_bucket, bucket_start)
  DO UPDATE SET
    bucket_end = EXCLUDED.bucket_end,
    conversations_count = EXCLUDED.conversations_count,
    bookings_count = EXCLUDED.bookings_count,
    orders_count = EXCLUDED.orders_count,
    leads_count = EXCLUDED.leads_count,
    conversion_count = EXCLUDED.conversion_count,
    conversion_rate = EXCLUDED.conversion_rate,
    revenue_total = EXCLUDED.revenue_total,
    no_show_count = EXCLUDED.no_show_count,
    missed_booking_recovery_count = EXCLUDED.missed_booking_recovery_count,
    missed_booking_recovery_revenue = EXCLUDED.missed_booking_recovery_revenue,
    after_hours_captures_count = EXCLUDED.after_hours_captures_count,
    revenue_leak_count = EXCLUDED.revenue_leak_count,
    revenue_leak_value = EXCLUDED.revenue_leak_value,
    leak_reasons = EXCLUDED.leak_reasons,
    source_updated_at = EXCLUDED.source_updated_at,
    updated_at = now();

  GET DIAGNOSTICS v_rows_upserted = ROW_COUNT;
  RETURN v_rows_upserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_receptionist_interval_metrics_incremental(
  p_interval_bucket text DEFAULT 'day',
  p_lookback interval DEFAULT interval '2 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_key text := 'receptionist_interval_metrics_' || p_interval_bucket;
  v_last_processed_at timestamptz;
  v_since timestamptz;
  v_until timestamptz := now();
  v_rows integer;
BEGIN
  IF p_interval_bucket NOT IN ('hour', 'day', 'week') THEN
    RAISE EXCEPTION 'Unsupported interval bucket: %', p_interval_bucket;
  END IF;

  SELECT aps.last_processed_at
  INTO v_last_processed_at
  FROM public.analytics_pipeline_state aps
  WHERE aps.pipeline_key = v_pipeline_key;

  v_since := COALESCE(v_last_processed_at - p_lookback, now() - interval '30 days');

  v_rows := public.refresh_receptionist_interval_metrics(v_since, v_until, p_interval_bucket);

  INSERT INTO public.analytics_pipeline_state (pipeline_key, last_processed_at, updated_at)
  VALUES (v_pipeline_key, v_until, now())
  ON CONFLICT (pipeline_key)
  DO UPDATE SET
    last_processed_at = EXCLUDED.last_processed_at,
    updated_at = now();

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_receptionist_interval_metrics(
  p_interval_bucket text DEFAULT 'day',
  p_start timestamptz DEFAULT now() - interval '30 days',
  p_end timestamptz DEFAULT now(),
  p_receptionist_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  receptionist_id uuid,
  receptionist_name text,
  business_name text,
  interval_bucket text,
  bucket_start timestamptz,
  bucket_end timestamptz,
  conversations_count integer,
  bookings_count integer,
  orders_count integer,
  leads_count integer,
  conversion_count integer,
  conversion_rate numeric,
  revenue_total numeric,
  no_show_count integer,
  missed_booking_recovery_count integer,
  missed_booking_recovery_revenue numeric,
  after_hours_captures_count integer,
  revenue_leak_count integer,
  revenue_leak_value numeric,
  leak_reasons jsonb,
  source_updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rim.receptionist_id,
    r.name AS receptionist_name,
    r.business_name,
    rim.interval_bucket,
    rim.bucket_start,
    rim.bucket_end,
    rim.conversations_count,
    rim.bookings_count,
    rim.orders_count,
    rim.leads_count,
    rim.conversion_count,
    rim.conversion_rate,
    rim.revenue_total,
    rim.no_show_count,
    rim.missed_booking_recovery_count,
    rim.missed_booking_recovery_revenue,
    rim.after_hours_captures_count,
    rim.revenue_leak_count,
    rim.revenue_leak_value,
    rim.leak_reasons,
    rim.source_updated_at
  FROM public.receptionist_interval_metrics rim
  JOIN public.receptionists r ON r.id = rim.receptionist_id
  WHERE rim.interval_bucket = p_interval_bucket
    AND rim.bucket_start >= p_start
    AND rim.bucket_start < p_end
    AND (p_receptionist_id IS NULL OR rim.receptionist_id = p_receptionist_id)
    AND r.user_id = COALESCE(auth.uid(), p_user_id)
  ORDER BY rim.bucket_start ASC;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_receptionist_interval_metrics(timestamptz, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_receptionist_interval_metrics_incremental(text, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_receptionist_interval_metrics(text, timestamptz, timestamptz, uuid, uuid) TO authenticated, service_role;

-- Existing deployments created a strict check constraint for legacy event types; remove it to support new conversion signals.
ALTER TABLE public.conversion_events
  DROP CONSTRAINT IF EXISTS conversion_events_event_type_check;

-- Seed + continuously refresh aggregate buckets with incremental overlaps.
SELECT public.run_receptionist_interval_metrics_incremental('hour', interval '6 hours');
SELECT public.run_receptionist_interval_metrics_incremental('day', interval '3 days');
SELECT public.run_receptionist_interval_metrics_incremental('week', interval '21 days');

SELECT cron.unschedule('receptionist_interval_metrics_hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'receptionist_interval_metrics_hourly');

SELECT cron.unschedule('receptionist_interval_metrics_daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'receptionist_interval_metrics_daily');

SELECT cron.unschedule('receptionist_interval_metrics_weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'receptionist_interval_metrics_weekly');

SELECT cron.schedule(
  'receptionist_interval_metrics_hourly',
  '*/5 * * * *',
  $$SELECT public.run_receptionist_interval_metrics_incremental('hour', interval '6 hours');$$
);

SELECT cron.schedule(
  'receptionist_interval_metrics_daily',
  '10 * * * *',
  $$SELECT public.run_receptionist_interval_metrics_incremental('day', interval '3 days');$$
);

SELECT cron.schedule(
  'receptionist_interval_metrics_weekly',
  '25 0 * * *',
  $$SELECT public.run_receptionist_interval_metrics_incremental('week', interval '21 days');$$
);
