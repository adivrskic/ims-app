/**
 * Format an amount in the given ISO 4217 currency code using the runtime's
 * locale defaults. Returns "—" for null/undefined so callers can hand off
 * unset values without a branch.
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string = "USD",
  opts: { locale?: string } = {}
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "—";
  }
  try {
    return new Intl.NumberFormat(opts.locale ?? "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    // Bad currency code; fall through to a plain numeric format
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

export function formatPercent(
  value: number | null | undefined,
  digits = 1
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** Margin in absolute and percentage terms. Returns nulls when either input is missing or price ≤ 0. */
export function computeMargin(
  cost: number | null,
  price: number | null
): { absolute: number | null; percent: number | null } {
  if (cost === null || price === null) return { absolute: null, percent: null };
  const absolute = price - cost;
  const percent = price > 0 ? (absolute / price) * 100 : null;
  return { absolute, percent };
}
