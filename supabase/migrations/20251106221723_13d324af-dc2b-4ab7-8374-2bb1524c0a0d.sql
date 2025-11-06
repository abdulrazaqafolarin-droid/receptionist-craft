-- Add advanced configuration fields to receptionists table
ALTER TABLE receptionists
ADD COLUMN IF NOT EXISTS goal text,
ADD COLUMN IF NOT EXISTS additional_languages text[],
ADD COLUMN IF NOT EXISTS system_prompt text,
ADD COLUMN IF NOT EXISTS knowledge_base text,
ADD COLUMN IF NOT EXISTS temperature numeric(3,2) DEFAULT 0.7,
ADD COLUMN IF NOT EXISTS allow_interruptions boolean DEFAULT false;