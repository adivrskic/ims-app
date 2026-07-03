import { describe, expect, it } from "vitest";
import { compareFefo } from "@/lib/data/fefo";

const lot = (expires_at: string | null, received_at: string | null = null) => ({
  expires_at,
  received_at,
});

describe("compareFefo", () => {
  it("orders earliest expiry first", () => {
    const lots = [lot("2026-09-01"), lot("2026-07-15"), lot("2026-08-01")];
    lots.sort(compareFefo);
    expect(lots.map((l) => l.expires_at)).toEqual([
      "2026-07-15",
      "2026-08-01",
      "2026-09-01",
    ]);
  });

  it("puts never-expiring lots after every dated lot", () => {
    const lots = [lot(null, "2025-01-01"), lot("2099-12-31")];
    lots.sort(compareFefo);
    expect(lots[0].expires_at).toBe("2099-12-31");
    expect(lots[1].expires_at).toBeNull();
  });

  it("falls back to FIFO (oldest receipt) among undated lots", () => {
    const lots = [lot(null, "2026-03-01"), lot(null, "2025-11-20")];
    lots.sort(compareFefo);
    expect(lots.map((l) => l.received_at)).toEqual([
      "2025-11-20",
      "2026-03-01",
    ]);
  });

  it("treats equal expiries as stable-equivalent", () => {
    expect(compareFefo(lot("2026-08-01"), lot("2026-08-01"))).toBe(0);
  });

  it("handles missing received_at without throwing", () => {
    expect(compareFefo(lot(null, null), lot(null, "2026-01-01"))).toBeLessThan(
      0
    );
  });
});
