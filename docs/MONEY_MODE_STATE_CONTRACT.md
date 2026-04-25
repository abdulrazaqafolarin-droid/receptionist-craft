# Money Mode State Contract (Frontend + Edge Runtime)

This contract defines a single precedence model for:
- `ai_mode` (base/manual mode)
- `capabilities.money_mode_enabled` (auto-mode toggle)
- `capabilities.money_mode_threshold` (intent score threshold, 1-10)

## Canonical precedence

1. **Base mode wins when explicitly `sales`**
   - If `ai_mode = sales`, effective mode is always `sales`.
2. **If auto-mode is disabled, stay in base mode**
   - `money_mode_enabled = false` prevents threshold auto-elevation.
3. **If auto-mode is enabled, threshold controls sales elevation**
   - If `intent_score >= money_mode_threshold`, effective mode becomes `sales`.
4. **Otherwise, remain in base mode**

## Legacy compatibility defaults

For rows missing capability keys:
- `money_mode_enabled` defaults to `true` only when `ai_mode = sales`, else `false`.
- `money_mode_threshold` defaults to `7`.
- threshold is clamped to integer range `[1, 10]`.

## Shared implementation points

- Frontend contract constants + resolver:
  - `src/lib/moneyModeContract.ts`
- Edge runtime contract constants + resolver:
  - `supabase/functions/_shared/moneyModeContract.ts`

Both implementations expose:
- threshold constants and clamping
- legacy capability normalization
- `resolveMoneyModeState()` returning:
  - `baseMode`
  - `autoModeEnabled`
  - `threshold`
  - `effectiveModeNow`
  - `scoreUsed`
