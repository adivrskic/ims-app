import { describe, expect, it } from "vitest";
import { fifoValue, type CostLayer } from "@/lib/fifoLayers";

const layer = (qty: number, unitCost: number, receivedAt: string): CostLayer => ({
  qty,
  unitCost,
  receivedAt,
});

describe("fifoValue", () => {
  it("values untouched stock at each layer's own cost", () => {
    const r = fifoValue(
      [layer(10, 2, "2026-01-01"), layer(10, 3, "2026-02-01")],
      20,
      0
    );
    expect(r.value).toBe(10 * 2 + 10 * 3);
    expect(r.layeredUnits).toBe(20);
    expect(r.unlayeredUnits).toBe(0);
  });

  it("consumes the OLDEST layer first", () => {
    // 20 received, 5 on hand → 15 consumed: all of Jan (10) + 5 of Feb.
    const r = fifoValue(
      [layer(10, 2, "2026-01-01"), layer(10, 3, "2026-02-01")],
      5,
      0
    );
    expect(r.value).toBe(5 * 3); // survivors are the newest units
    expect(r.remaining).toEqual([
      { qty: 5, unitCost: 3, receivedAt: "2026-02-01" },
    ]);
  });

  it("splits consumption across a partially-consumed layer", () => {
    const r = fifoValue(
      [layer(10, 2, "2026-01-01"), layer(10, 3, "2026-02-01")],
      12,
      0
    );
    // 8 consumed → 2 left of Jan @2 + all 10 of Feb @3
    expect(r.value).toBe(2 * 2 + 10 * 3);
    expect(r.remaining.length).toBe(2);
  });

  it("sorts unordered layers by receipt date", () => {
    const r = fifoValue(
      [layer(10, 3, "2026-02-01"), layer(10, 2, "2026-01-01")],
      5,
      0
    );
    expect(r.value).toBe(5 * 3);
  });

  it("values on-hand beyond all receipts at the fallback cost", () => {
    const r = fifoValue([layer(10, 2, "2026-01-01")], 15, 4);
    expect(r.layeredUnits).toBe(10);
    expect(r.unlayeredUnits).toBe(5);
    expect(r.value).toBe(10 * 2 + 5 * 4);
  });

  it("handles no receipt history at all", () => {
    const r = fifoValue([], 7, 3);
    expect(r.value).toBe(21);
    expect(r.unlayeredUnits).toBe(7);
  });

  it("returns zero for zero or negative on-hand", () => {
    expect(fifoValue([layer(10, 2, "2026-01-01")], 0, 5).value).toBe(0);
    expect(fifoValue([layer(10, 2, "2026-01-01")], -3, 5).value).toBe(0);
  });

  it("ignores zero-qty layers and negative fallback", () => {
    const r = fifoValue(
      [layer(0, 99, "2025-12-01"), layer(10, 2, "2026-01-01")],
      12,
      -1
    );
    expect(r.value).toBe(10 * 2); // 2 unlayered units at clamped cost 0
    expect(r.unlayeredUnits).toBe(2);
  });
});
