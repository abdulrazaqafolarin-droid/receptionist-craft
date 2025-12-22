-- ═══════════════════════════════════════════════════════════════════════════
-- CHAT MESSAGE CLEANUP - Scheduled Deletion for Privacy and Storage
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable pg_cron extension for scheduled jobs (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to delete old chat messages (older than 30 days by default)
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages(retention_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.chat_messages 
  WHERE created_at < NOW() - (retention_days || ' days')::interval;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup action
  RAISE NOTICE 'Cleaned up % chat messages older than % days', deleted_count, retention_days;
  
  RETURN deleted_count;
END;
$$;

-- Create function to delete old AI booking suggestions (older than 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_booking_suggestions(retention_days integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.ai_booking_suggestions 
  WHERE created_at < NOW() - (retention_days || ' days')::interval;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Create function to archive/delete old conversations (older than 90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_conversations(retention_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.conversations 
  WHERE created_at < NOW() - (retention_days || ' days')::interval;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.cleanup_old_chat_messages(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_booking_suggestions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_conversations(integer) TO service_role;