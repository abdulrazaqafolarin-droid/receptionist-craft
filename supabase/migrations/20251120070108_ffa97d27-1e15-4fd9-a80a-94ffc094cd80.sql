-- Enable realtime for analytics_cache table
ALTER TABLE analytics_cache REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE analytics_cache;