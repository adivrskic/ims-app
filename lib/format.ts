/**
 * Shared date / money formatting. Pure, importable from server and client.
 *
 * `lib/dashboard.ts#formatCurrency` is the COMPACT KPI formatter ("$12.5k");
 * `formatMoney` here is the full-precision one for documents and line items.
 */

/** "5m ago", "3h ago", "2d ago", "Just now" — same output on server and client. */
export function relTime(
  iso: string | null | undefined,
  now = Date.now()
): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/** Alias kept for call sites that used the other name. */
export const timeAgo = relTime;

/** "$1,234.50" — full precision, locale grouping. */
export function formatMoney(
  value: number | string | null | undefined,
  currency = "USD"
): string {
  const n =
    typeof value === "string" ? parseFloat(value) : Number(value ?? NaN);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "Oct 26, 2026" from an ISO string or YYYY-MM-DD; "—" when missing. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // A date-only string parses as UTC midnight and would shift a day back in
  // western zones; pin it to local midnight instead.
  const d = DATE_ONLY.test(iso) ? new Date(iso + "T00:00:00") : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Base-26 letters: 0→A, 25→Z, 26→AA, 27→AB … (section codes). */
export function alphaCode(n: number): string {
  let s = "";
  let i = Math.max(0, Math.floor(n));
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}
