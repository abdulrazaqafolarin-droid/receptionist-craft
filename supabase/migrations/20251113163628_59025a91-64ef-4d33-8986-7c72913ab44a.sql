-- Add missing DELETE policies for tables that need them

-- Allow users to delete their own appointments
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

-- Allow users to delete their own integrations
CREATE POLICY "Users can delete own integrations"
ON public.integrations
FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to delete their own chat messages
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

-- Allow users to delete their own conversations
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