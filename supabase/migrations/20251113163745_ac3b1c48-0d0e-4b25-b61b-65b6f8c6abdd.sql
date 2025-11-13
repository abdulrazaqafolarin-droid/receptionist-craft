-- Drop existing policies if they exist to avoid conflicts, then recreate them
DO $$ 
BEGIN
  -- Drop and recreate appointments DELETE policy
  DROP POLICY IF EXISTS "Users can delete own appointments" ON public.appointments;
  CREATE POLICY "Users can delete own appointments"
  ON public.appointments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.receptionists
      WHERE receptionists.id = appointments.receptionist_id
      AND receptionists.user_id = auth.uid()
    )
  );

  -- Drop and recreate integrations DELETE policy
  DROP POLICY IF EXISTS "Users can delete own integrations" ON public.integrations;
  CREATE POLICY "Users can delete own integrations"
  ON public.integrations
  FOR DELETE
  USING (auth.uid() = user_id);

  -- Drop and recreate chat_messages DELETE policy
  DROP POLICY IF EXISTS "Users can delete own chat messages" ON public.chat_messages;
  CREATE POLICY "Users can delete own chat messages"
  ON public.chat_messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.receptionists
      WHERE receptionists.id = chat_messages.receptionist_id
      AND receptionists.user_id = auth.uid()
    )
  );

  -- Drop and recreate conversations DELETE policy
  DROP POLICY IF EXISTS "Users can delete own conversations" ON public.conversations;
  CREATE POLICY "Users can delete own conversations"
  ON public.conversations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.receptionists
      WHERE receptionists.id = conversations.receptionist_id
      AND receptionists.user_id = auth.uid()
    )
  );
END $$;