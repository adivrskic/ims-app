import { describe, it, expect } from "vitest";
import {
  mean,
  stdDev,
  trendSlope,
  zForServiceLevel,
  dayOfWeekSeasonality,
  buildForecast,
} from "@/lib/forecast";

describe("forecast math", () => {
  it("mean", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBe(0);
  });

  it("sample stdDev (n-1), zero for <2 points", () => {
    expect(stdDev([2, 4])).toBeCloseTo(Math.SQRT2, 6);
    expect(stdDev([5])).toBe(0);
    expect(stdDev([3, 3, 3])).toBe(0);
  });

  it("trendSlope of a linear series", () => {
    expect(trendSlope([1, 2, 3, 4, 5])).toBeCloseTo(1, 6);
    expect(trendSlope([5, 4, 3, 2, 1])).toBeCloseTo(-1, 6);
    expect(trendSlope([3, 3, 3])).toBe(0);
  });

  it("zForServiceLevel snaps to the nearest tabulated level", () => {
    expect(zForServiceLevel(0.95)).toBeCloseTo(1.6449, 4);
    expect(zForServiceLevel(0.99)).toBeCloseTo(2.3263, 4);
    expect(zForServiceLevel(0.5)).toBeCloseTo(0.8416, 4); // nearest is 0.8
  });

  it("seasonality is insignificant for a flat / short series", () => {
    const flat = new Array(35).fill(4);
    expect(dayOfWeekSeasonality(flat, 0).significant).toBe(false);
    expect(dayOfWeekSeasonality([1, 2, 3], 0).significant).toBe(false); // <28d
  });

  it("buildForecast on a flat series: no safety stock, ROP = lead-time demand", () => {
    const f = buildForecast(new Array(30).fill(4), {
      startDow: 0,
      nextDow: 1,
      leadTimeDays: 7,
      serviceLevel: 0.95,
    });
    expect(f.avgDaily).toBe(4);
    expect(f.trendPerDay).toBeCloseTo(0, 6);
    expect(f.demandStdDev).toBe(0);
    expect(f.forecastLeadTime).toBeCloseTo(28, 6); // 4/day × 7 days
    expect(f.safetyStock).toBe(0); // z × 0 × √lead
    expect(f.reorderPoint).toBe(28);
    expect(f.dataPoints).toBe(30);
  });

  it("buildForecast adds statistical safety stock when demand varies", () => {
    const noisy = [2, 6, 3, 5, 4, 6, 2, 5, 3, 6, 4, 5, 2, 6];
    const f = buildForecast(noisy, {
      startDow: 0,
      nextDow: 0,
      leadTimeDays: 5,
      serviceLevel: 0.95,
    });
    expect(f.safetyStock).toBeGreaterThan(0);
    expect(f.reorderPoint).toBeGreaterThanOrEqual(Math.ceil(f.forecastLeadTime));
  });
});
