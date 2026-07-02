import { describe, it, expect } from "vitest";
import {
  dailyVelocity,
  daysToStockout,
  reorderPoint,
  economicOrderQty,
} from "@/lib/replenishment";

describe("replenishment math", () => {
  it("dailyVelocity", () => {
    expect(dailyVelocity({ totalUnitsConsumed: 70, days: 7 })).toBe(10);
    expect(dailyVelocity({ totalUnitsConsumed: 70, days: 0 })).toBe(0);
    expect(dailyVelocity({ totalUnitsConsumed: -5, days: 5 })).toBe(0);
  });

  it("daysToStockout returns null on no demand signal", () => {
    expect(daysToStockout({ onHand: 100, velocity: 10 })).toBe(10);
    expect(daysToStockout({ onHand: 95, velocity: 10 })).toBe(9); // floor
    expect(daysToStockout({ onHand: 100, velocity: 0 })).toBeNull();
    expect(daysToStockout({ onHand: -3, velocity: 10 })).toBe(0);
  });

  it("reorderPoint = velocity×lead + safety, falls back to safety when idle", () => {
    expect(reorderPoint({ velocity: 10, leadTimeDays: 7, safetyStock: 20 })).toBe(90);
    expect(reorderPoint({ velocity: 0, leadTimeDays: 7, safetyStock: 20 })).toBe(20);
    expect(reorderPoint({ velocity: 10, leadTimeDays: 0, safetyStock: 5 })).toBe(5);
  });

  it("economicOrderQty needs demand AND a cost signal", () => {
    // EOQ = ceil(sqrt(2 * 1200 * 25 / 2.5)) = ceil(sqrt(24000)) = 155
    expect(
      economicOrderQty({ annualDemand: 1200, orderCost: 25, unitCost: 10 })
    ).toBe(155);
    expect(economicOrderQty({ annualDemand: 0, unitCost: 10 })).toBeNull();
    expect(economicOrderQty({ annualDemand: 1200 })).toBeNull(); // no cost
  });
});
