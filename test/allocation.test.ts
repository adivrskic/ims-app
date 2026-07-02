import { describe, it, expect } from "vitest";
import { planAllocation, type AllocLine } from "@/lib/data/allocation";

const line = (over: Partial<AllocLine> & { id: string; productId: string }): AllocLine => ({
  requested: 0,
  allocated: 0,
  picked: 0,
  ...over,
});

describe("planAllocation (greedy stock allocation)", () => {
  it("allocates the full request when the pool covers it", () => {
    const [p] = planAllocation(
      [line({ id: "l1", productId: "A", requested: 10 })],
      new Map([["A", 10]])
    );
    expect(p.allocated).toBe(10);
    expect(p.changed).toBe(true);
  });

  it("caps allocation at the available pool", () => {
    const [p] = planAllocation(
      [line({ id: "l1", productId: "A", requested: 10 })],
      new Map([["A", 3]])
    );
    expect(p.allocated).toBe(3);
  });

  it("never drops below already-picked units", () => {
    const [p] = planAllocation(
      [line({ id: "l1", productId: "A", requested: 10, picked: 4 })],
      new Map([["A", 0]])
    );
    expect(p.allocated).toBe(4); // floored at picked, no free pool
  });

  it("draws a shared product pool across lines in order", () => {
    const [a, b] = planAllocation(
      [
        line({ id: "l1", productId: "A", requested: 6 }),
        line({ id: "l2", productId: "A", requested: 6 }),
      ],
      new Map([["A", 10]])
    );
    expect(a.allocated).toBe(6); // first line drains 6
    expect(b.allocated).toBe(4); // second gets the remaining 4
  });

  it("reports changed=false when the plan matches the current allocation", () => {
    const [p] = planAllocation(
      [line({ id: "l1", productId: "A", requested: 5, allocated: 5 })],
      new Map([["A", 5]])
    );
    expect(p.allocated).toBe(5);
    expect(p.changed).toBe(false);
  });

  it("treats a missing pool entry as zero available", () => {
    const [p] = planAllocation(
      [line({ id: "l1", productId: "A", requested: 5 })],
      new Map()
    );
    expect(p.allocated).toBe(0);
  });
});
