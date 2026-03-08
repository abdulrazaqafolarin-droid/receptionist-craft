/**
 * Shared currency formatting utility.
 * Uses the browser's Intl.NumberFormat for locale-aware formatting.
 * Falls back to a symbol map for known currencies.
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  EUR: '€',
  GBP: '£',
  KES: 'KSh',
  GHS: 'GH₵',
  ZAR: 'R',
  INR: '₹',
  CAD: 'CA$',
  AUD: 'A$',
  JPY: '¥',
  CNY: '¥',
  BRL: 'R$',
};

/** Default currency when none is specified */
export const DEFAULT_CURRENCY = 'USD';

/**
 * Format a number as currency using Intl if available, else symbol map.
 * @param amount  Numeric value
 * @param currency ISO 4217 code (default: USD)
 * @param opts.minimumFractionDigits  (default 2)
 * @param opts.maximumFractionDigits  (default 2)
 */
export function formatCurrency(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  opts?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const min = opts?.minimumFractionDigits ?? 2;
  const max = opts?.maximumFractionDigits ?? 2;

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(amount);
  } catch {
    // Fallback for unknown currency codes
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max })}`;
  }
}

/**
 * Get just the symbol for a currency code.
 */
export function getCurrencySymbol(currency: string = DEFAULT_CURRENCY): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return CURRENCY_SYMBOLS[currency] || currency;
  }
}
