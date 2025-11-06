-- Create chat_messages table for persistent chat history
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  receptionist_id UUID NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')),
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can view their own chat messages
CREATE POLICY "Users can view own chat messages"
ON public.chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM receptionists
    WHERE receptionists.id = chat_messages.receptionist_id
    AND receptionists.user_id = auth.uid()
  )
);

-- Users can create chat messages for their receptionists
CREATE POLICY "Users can create chat messages"
ON public.chat_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM receptionists
    WHERE receptionists.id = chat_messages.receptionist_id
    AND receptionists.user_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX idx_chat_messages_receptionist_user ON public.chat_messages(receptionist_id, user_id, created_at);