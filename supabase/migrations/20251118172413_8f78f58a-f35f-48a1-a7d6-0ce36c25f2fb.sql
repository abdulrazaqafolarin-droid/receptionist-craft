-- Migration 0002: Add metadata column to chat_messages table
-- This adds metadata storage for conversation context and indexing for performance

-- Add metadata column
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Create index for receptionist_id and created_at for faster message retrieval
CREATE INDEX IF NOT EXISTS idx_chat_receptionist_created_at 
ON public.chat_messages (receptionist_id, created_at DESC);

-- Create index for user_id filtering
CREATE INDEX IF NOT EXISTS idx_chat_user_created_at 
ON public.chat_messages (user_id, created_at DESC);

-- Add GIN index for metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_chat_metadata 
ON public.chat_messages USING GIN (metadata);