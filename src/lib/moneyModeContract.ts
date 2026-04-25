export type AiBaseMode = "support" | "booking" | "sales";

export interface MoneyModeCapabilities {
  money_mode_enabled?: unknown;
  money_mode_threshold?: unknown;
  [key: string]: unknown;
}

export interface MoneyModeContractState {
  baseMode: AiBaseMode;
  autoModeEnabled: boolean;
  threshold: number;
  effectiveModeNow: AiBaseMode;
  scoreUsed: number;
}

export const MONEY_MODE_THRESHOLD_MIN = 1;
export const MONEY_MODE_THRESHOLD_MAX = 10;
export const MONEY_MODE_THRESHOLD_DEFAULT = 7;

export function clampMoneyModeThreshold(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return MONEY_MODE_THRESHOLD_DEFAULT;
  }
  return Math.max(MONEY_MODE_THRESHOLD_MIN, Math.min(MONEY_MODE_THRESHOLD_MAX, Math.round(value)));
}

export function normalizeMoneyModeCapabilities(
  baseMode: AiBaseMode,
  capabilities: MoneyModeCapabilities | null | undefined,
): Required<Pick<MoneyModeCapabilities, "money_mode_enabled" | "money_mode_threshold">> & MoneyModeCapabilities {
  const source = capabilities ?? {};

  const autoModeEnabled =
    typeof source.money_mode_enabled === "boolean"
      ? source.money_mode_enabled
      : baseMode === "sales";

  const threshold = clampMoneyModeThreshold(source.money_mode_threshold);

  return {
    ...source,
    money_mode_enabled: autoModeEnabled,
    money_mode_threshold: threshold,
  };
}

export function computeEffectiveMode(
  baseMode: AiBaseMode,
  autoModeEnabled: boolean,
  threshold: number,
  intentScore: number,
): AiBaseMode {
  // Precedence contract (same in frontend + edge runtime):
  // 1) Explicit base ai_mode="sales" always wins.
  // 2) If auto mode is disabled, stay in base mode.
  // 3) If auto mode is enabled and intent score >= threshold, elevate to sales.
  // 4) Otherwise stay in base mode.
  if (baseMode === "sales") return "sales";
  if (!autoModeEnabled) return baseMode;
  return intentScore >= clampMoneyModeThreshold(threshold) ? "sales" : baseMode;
}

export function clampIntentScore(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(MONEY_MODE_THRESHOLD_MAX, Math.round(value)));
}

export function resolveMoneyModeState(params: {
  baseMode: AiBaseMode;
  capabilities: MoneyModeCapabilities | null | undefined;
  intentScore?: number;
}): MoneyModeContractState {
  const normalizedCapabilities = normalizeMoneyModeCapabilities(params.baseMode, params.capabilities);
  const scoreUsed = clampIntentScore(params.intentScore ?? 0);

  return {
    baseMode: params.baseMode,
    autoModeEnabled: normalizedCapabilities.money_mode_enabled,
    threshold: normalizedCapabilities.money_mode_threshold,
    effectiveModeNow: computeEffectiveMode(
      params.baseMode,
      normalizedCapabilities.money_mode_enabled,
      normalizedCapabilities.money_mode_threshold,
      scoreUsed,
    ),
    scoreUsed,
  };
}
