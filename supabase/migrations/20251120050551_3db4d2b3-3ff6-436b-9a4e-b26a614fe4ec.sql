-- Create analytics_cache table for storing computed analytics
CREATE TABLE IF NOT EXISTS analytics_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_analytics_cache_user ON analytics_cache(user_id);

-- Enable RLS on analytics_cache
ALTER TABLE analytics_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies for analytics_cache
CREATE POLICY "Users can view own analytics cache"
  ON analytics_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analytics cache"
  ON analytics_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analytics cache"
  ON analytics_cache FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own analytics cache"
  ON analytics_cache FOR DELETE
  USING (auth.uid() = user_id);