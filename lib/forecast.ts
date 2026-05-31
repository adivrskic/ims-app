/**
 * Demand forecasting math (pure — no DB, no side effects).
 *
 * Extends the flat-average replenishment model (lib/replenishment.ts) with the
 * service-level / statistical pieces that file flagged as out of scope:
 *   - trend (linear regression slope over the daily demand series)
 *   - day-of-week seasonality factors
 *   - statistical safety stock: z(serviceLevel) × σ × √leadTime
 *   - a forecast-driven reorder point (projected lead-time demand + safety stock)
 *
 * Inputs are daily demand series (units consumed per day), oldest → newest.
 */

/** z-score for a few common service levels (fill rate). Default 95%. */
export function zForServiceLevel(serviceLevel: number): number {
  const table: Array<[number, number]> = [
    [0.8, 0.8416],
    [0.85, 1.0364],
    [0.9, 1.2816],
    [0.95, 1.6449],
    [0.975, 1.96],
    [0.99, 2.3263],
  ];
  let best = table[3][1]; // 0.95
  let bestDiff = Infinity;
  for (const [p, z] of table) {
    const d = Math.abs(p - serviceLevel);
    if (d < bestDiff) {
      bestDiff = d;
      best = z;
    }
  }
  return best;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Sample standard deviation (n-1). */
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance =
    xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

/** Linear regression slope (units/day change) over an evenly-spaced series. */
export function trendSlope(series: number[]): number {
  const n = series.length;
  if (n < 2) return 0;
  // x = 0..n-1
  const xMean = (n - 1) / 2;
  const yMean = mean(series);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (series[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  return den === 0 ? 0 : num / den;
}

export interface Seasonality {
  /** factor[0..6] (Sun..Sat) = avg demand that weekday ÷ overall avg. */
  factors: number[];
  /** True when there's enough data and the swing is material. */
  significant: boolean;
  /** Weekday index (0=Sun) with the highest factor. */
  peakDow: number;
}

/**
 * Day-of-week seasonality. `series` is aligned so that index 0 falls on
 * `startDow` (0=Sun..6=Sat). Needs ≥ 28 days to be considered significant.
 */
export function dayOfWeekSeasonality(
  series: number[],
  startDow: number
): Seasonality {
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (let i = 0; i < series.length; i++) {
    const dow = (startDow + i) % 7;
    sums[dow] += series[i];
    counts[dow] += 1;
  }
  const overall = mean(series);
  const factors = sums.map((s, d) =>
    counts[d] > 0 && overall > 0 ? s / counts[d] / overall : 1
  );
  let peakDow = 0;
  for (let d = 1; d < 7; d++) if (factors[d] > factors[peakDow]) peakDow = d;
  const max = Math.max(...factors);
  const min = Math.min(...factors);
  const significant = series.length >= 28 && overall > 0 && max / (min || 1) >= 1.5;
  return { factors, significant, peakDow };
}

export interface ForecastResult {
  avgDaily: number;
  trendPerDay: number;
  demandStdDev: number;
  /** Forecasted total demand over the next `leadTimeDays`. */
  forecastLeadTime: number;
  safetyStock: number;
  reorderPoint: number;
  seasonality: Seasonality;
  dataPoints: number;
}

/**
 * Build a forecast from a daily demand series.
 *
 * Projects each future day over the lead time as
 *   max(0, avgDaily + slope × dayOffset) × dowFactor
 * then adds statistical safety stock for the reorder point.
 */
export function buildForecast(
  series: number[],
  opts: {
    startDow: number;
    /** Day-of-week of "tomorrow" (forecast day 1), 0=Sun. */
    nextDow: number;
    leadTimeDays: number;
    serviceLevel?: number;
  }
): ForecastResult {
  const avgDaily = mean(series);
  const trendPerDay = trendSlope(series);
  const demandStdDev = stdDev(series);
  const seasonality = dayOfWeekSeasonality(series, opts.startDow);
  const lead = Math.max(0, Math.round(opts.leadTimeDays));
  const z = zForServiceLevel(opts.serviceLevel ?? 0.95);

  let forecastLeadTime = 0;
  for (let d = 1; d <= lead; d++) {
    const base = Math.max(0, avgDaily + trendPerDay * d);
    const dow = (opts.nextDow + (d - 1)) % 7;
    const factor = seasonality.significant ? seasonality.factors[dow] : 1;
    forecastLeadTime += base * factor;
  }

  const safetyStock = Math.ceil(z * demandStdDev * Math.sqrt(Math.max(0, lead)));
  const reorderPoint = Math.ceil(forecastLeadTime + safetyStock);

  return {
    avgDaily,
    trendPerDay,
    demandStdDev,
    forecastLeadTime,
    safetyStock,
    reorderPoint,
    seasonality,
    dataPoints: series.length,
  };
}
