-- Browser-lane devices: Jev-driven browsers under the Director.
--
-- Same protocol, same gates as every other device (pair once, poll,
-- complete, heartbeat; enabled flag is the master switch). The only
-- difference is the executor: an absorbed browser-use loop (fresh
-- indexed element table every observation, one decision per round
-- trip) instead of mouse/keyboard or shell. It gets its own platform
-- value so the brain routes browse_task deliberately, never by
-- accident, and the app labels it honestly.

ALTER TABLE public.companion_devices
  DROP CONSTRAINT companion_devices_platform_check;

ALTER TABLE public.companion_devices
  ADD CONSTRAINT companion_devices_platform_check
  CHECK (platform IN ('windows', 'macos', 'android', 'runner', 'browser'));
