-- Runner devices: shells that lend the brain command execution.
--
-- A runner speaks the exact same companion protocol (pair, poll,
-- complete, heartbeat) and is gated identically (enabled flag,
-- revoke, ask-every-time). The only difference is what it executes:
-- shell commands instead of mouse and keyboard. It gets its own
-- platform value so the app can label it honestly and the brain can
-- pick hands vs. shell deliberately. Refusal patterns live in the
-- runner itself (it sees the raw command); the ledger records every
-- execution either way.

ALTER TABLE public.companion_devices
  DROP CONSTRAINT companion_devices_platform_check;

ALTER TABLE public.companion_devices
  ADD CONSTRAINT companion_devices_platform_check
  CHECK (platform IN ('windows', 'macos', 'android', 'runner'));
