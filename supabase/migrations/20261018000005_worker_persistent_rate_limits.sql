-- Persistent, atomic rate limiting for authenticated worker endpoints.
-- Edge Functions call this SECURITY DEFINER RPC with the identity verified by
-- Supabase Auth. Browser roles cannot read or mutate the bucket table directly.

CREATE TABLE IF NOT EXISTS public.ai_worker_rate_limit_buckets (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope ~ '^[a-z][a-z0-9_-]{1,63}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 1),
  burst_started_at timestamptz NOT NULL,
  burst_count integer NOT NULL CHECK (burst_count >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, scope)
);

ALTER TABLE public.ai_worker_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_worker_rate_limit_buckets FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_ai_worker_rate_limit(
  p_actor_id uuid,
  p_scope text,
  p_window_seconds integer,
  p_max_requests integer,
  p_burst_window_seconds integer,
  p_max_burst integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_bucket public.ai_worker_rate_limit_buckets%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_window_expired boolean;
  v_burst_expired boolean;
  v_window_retry integer;
  v_burst_retry integer;
  v_retry integer;
  v_reason text;
BEGIN
  IF p_actor_id IS NULL
     OR p_scope IS NULL OR p_scope !~ '^[a-z][a-z0-9_-]{1,63}$'
     OR p_window_seconds IS NULL OR p_window_seconds NOT BETWEEN 1 AND 3600
     OR p_max_requests IS NULL OR p_max_requests NOT BETWEEN 1 AND 1000
     OR p_burst_window_seconds IS NULL OR p_burst_window_seconds NOT BETWEEN 1 AND 300
     OR p_max_burst IS NULL OR p_max_burst NOT BETWEEN 1 AND 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_rate_limit_request');
  END IF;

  INSERT INTO public.ai_worker_rate_limit_buckets (
    actor_id, scope, window_started_at, request_count,
    burst_started_at, burst_count, updated_at
  ) VALUES (
    p_actor_id, p_scope, v_now, 1, v_now, 1, v_now
  )
  ON CONFLICT (actor_id, scope) DO UPDATE SET
    window_started_at = CASE
      WHEN public.ai_worker_rate_limit_buckets.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now THEN v_now
      ELSE public.ai_worker_rate_limit_buckets.window_started_at
    END,
    request_count = CASE
      WHEN public.ai_worker_rate_limit_buckets.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now THEN 1
      ELSE public.ai_worker_rate_limit_buckets.request_count + 1
    END,
    burst_started_at = CASE
      WHEN public.ai_worker_rate_limit_buckets.burst_started_at
        + make_interval(secs => p_burst_window_seconds) <= v_now THEN v_now
      ELSE public.ai_worker_rate_limit_buckets.burst_started_at
    END,
    burst_count = CASE
      WHEN public.ai_worker_rate_limit_buckets.burst_started_at
        + make_interval(secs => p_burst_window_seconds) <= v_now THEN 1
      ELSE public.ai_worker_rate_limit_buckets.burst_count + 1
    END,
    updated_at = v_now
  RETURNING * INTO v_bucket;

  v_window_expired := v_bucket.window_started_at + make_interval(secs => p_window_seconds) <= v_now;
  v_burst_expired := v_bucket.burst_started_at + make_interval(secs => p_burst_window_seconds) <= v_now;
  v_window_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
    v_bucket.window_started_at + make_interval(secs => p_window_seconds) - v_now
  )))::integer);
  v_burst_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
    v_bucket.burst_started_at + make_interval(secs => p_burst_window_seconds) - v_now
  )))::integer);

  IF v_bucket.request_count > p_max_requests OR v_bucket.burst_count > p_max_burst THEN
    v_reason := CASE
      WHEN v_bucket.request_count > p_max_requests THEN 'window'
      ELSE 'burst'
    END;
    v_retry := CASE
      WHEN v_bucket.request_count > p_max_requests AND v_bucket.burst_count > p_max_burst
        THEN GREATEST(v_window_retry, v_burst_retry)
      WHEN v_bucket.request_count > p_max_requests THEN v_window_retry
      ELSE v_burst_retry
    END;
    RETURN jsonb_build_object(
      'ok', true, 'allowed', false, 'reason', v_reason,
      'retry_after_seconds', v_retry, 'remaining', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'allowed', true, 'reason', NULL,
    'retry_after_seconds', 0,
    'remaining', LEAST(p_max_requests - v_bucket.request_count, p_max_burst - v_bucket.burst_count)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_ai_worker_rate_limit(uuid, text, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_worker_rate_limit(uuid, text, integer, integer, integer, integer)
  TO service_role;

COMMENT ON TABLE public.ai_worker_rate_limit_buckets IS
  'Server-only atomic per-user rate-limit buckets shared across Edge Function isolates.';
