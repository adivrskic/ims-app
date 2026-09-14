import { afterEach, describe, it, expect } from "vitest";
import {
  TRIAL_DAYS,
  TRIAL_LENGTH_MS,
  entitlementAt,
  formatDaysLeft,
  isEntitled,
  isPaidSubscriptionStatus,
  isTrialExemptPath,
  resolveEntitlement,
  type Entitlement,
} from "@/lib/entitlement";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A workspace created mid-afternoon UTC — deliberately not on a day boundary. */
const STARTED = "2026-09-13T15:30:00.000Z";
const START = Date.parse(STARTED);
const END = START + 7 * DAY;
const ENDS_AT = "2026-09-20T15:30:00.000Z";

function onTrial(now: number, subscriptionStatus: string | null = null) {
  return resolveEntitlement({ trialStartedAt: STARTED, subscriptionStatus }, now);
}

describe("resolveEntitlement — the 7-day trial clock", () => {
  it("is exactly 7 × 24 hours from the moment the workspace was created", () => {
    expect(TRIAL_DAYS).toBe(7);
    expect(TRIAL_LENGTH_MS).toBe(168 * HOUR);
    expect(onTrial(START).trialEndsAt).toBe(ENDS_AT);
  });

  it("starts with 7 days left", () => {
    expect(onTrial(START)).toEqual({ state: "trial", trialEndsAt: ENDS_AT, daysLeft: 7 });
  });

  it("counts whole days down, rounding up", () => {
    expect(onTrial(START + 1).daysLeft).toBe(7);
    expect(onTrial(START + DAY - 1).daysLeft).toBe(7);
    expect(onTrial(START + DAY).daysLeft).toBe(6);
    expect(onTrial(START + 6 * DAY - 1).daysLeft).toBe(2);
    expect(onTrial(START + 6 * DAY).daysLeft).toBe(1);
  });

  it("is still a trial one millisecond before the 7-day mark", () => {
    expect(onTrial(END - 1)).toEqual({ state: "trial", trialEndsAt: ENDS_AT, daysLeft: 1 });
  });

  it("expires exactly at the 7-day mark", () => {
    expect(onTrial(END)).toEqual({ state: "expired", trialEndsAt: ENDS_AT, daysLeft: 0 });
    expect(onTrial(END + 1).state).toBe("expired");
    expect(onTrial(END + 400 * DAY).state).toBe("expired");
  });

  it("takes now as a Date or as epoch milliseconds", () => {
    expect(resolveEntitlement({ trialStartedAt: STARTED, subscriptionStatus: null }, new Date(END - 1))).toEqual(
      onTrial(END - 1)
    );
  });

  it("accepts the trial start as a Date", () => {
    expect(resolveEntitlement({ trialStartedAt: new Date(START), subscriptionStatus: null }, END)).toEqual(
      onTrial(END)
    );
  });

  it("only an expired trial loses access", () => {
    expect(isEntitled(onTrial(START))).toBe(true);
    expect(isEntitled(onTrial(END - 1))).toBe(true);
    expect(isEntitled(onTrial(END))).toBe(false);
    expect(isEntitled({ state: "grandfathered" })).toBe(true);
    expect(isEntitled({ state: "paid" })).toBe(true);
  });
});

describe("resolveEntitlement — grandfathered workspaces", () => {
  it("a workspace with no trial clock is grandfathered, however much time passes", () => {
    for (const trialStartedAt of [null, undefined]) {
      const e = resolveEntitlement({ trialStartedAt, subscriptionStatus: null }, END + 5000 * DAY);
      expect(e).toEqual({ state: "grandfathered", trialEndsAt: null, daysLeft: null });
      expect(isEntitled(e)).toBe(true);
    }
  });

  it("fails open on a trial clock it can't read", () => {
    for (const trialStartedAt of ["", "not a date", "2026-13-45T99:00:00Z"]) {
      expect(resolveEntitlement({ trialStartedAt, subscriptionStatus: null }, END + DAY).state).toBe(
        "grandfathered"
      );
    }
    expect(resolveEntitlement({ trialStartedAt: new Date(Number.NaN), subscriptionStatus: null }, END).state).toBe(
      "grandfathered"
    );
  });

  it("fails open on an unreadable now rather than calling the trial over", () => {
    expect(resolveEntitlement({ trialStartedAt: STARTED, subscriptionStatus: null }, Number.NaN).state).toBe(
      "grandfathered"
    );
  });

  it("stays grandfathered after cancelling a subscription it never needed", () => {
    expect(resolveEntitlement({ trialStartedAt: null, subscriptionStatus: "canceled" }, END).state).toBe(
      "grandfathered"
    );
  });
});

describe("resolveEntitlement — subscriptions", () => {
  it("a missing subscription row falls back to the trial clock", () => {
    for (const subscriptionStatus of [null, undefined]) {
      expect(resolveEntitlement({ trialStartedAt: STARTED, subscriptionStatus }, START).state).toBe("trial");
      expect(resolveEntitlement({ trialStartedAt: STARTED, subscriptionStatus }, END).state).toBe("expired");
    }
  });

  it.each(["active", "trialing", "past_due"])(
    "%s is paid and never gated, even long after the trial ended",
    (status) => {
      const e = onTrial(END + 90 * DAY, status);
      expect(e).toEqual({ state: "paid", trialEndsAt: ENDS_AT, daysLeft: null });
      expect(isEntitled(e)).toBe(true);
    }
  );

  it("past_due keeps access — Stripe is still retrying the card", () => {
    expect(isEntitled(onTrial(END, "past_due"))).toBe(true);
  });

  it("paying during the trial ends the countdown", () => {
    expect(onTrial(START + DAY, "active")).toEqual({ state: "paid", trialEndsAt: ENDS_AT, daysLeft: null });
  });

  it("paid without a trial clock has no trial end", () => {
    expect(resolveEntitlement({ trialStartedAt: null, subscriptionStatus: "active" }, END)).toEqual({
      state: "paid",
      trialEndsAt: null,
      daysLeft: null,
    });
  });

  it("canceled after the trial is expired", () => {
    const e = onTrial(END + DAY, "canceled");
    expect(e.state).toBe("expired");
    expect(isEntitled(e)).toBe(false);
  });

  it("canceled while the trial is still running leaves the rest of the trial", () => {
    expect(onTrial(START + 2 * DAY, "canceled")).toEqual({ state: "trial", trialEndsAt: ENDS_AT, daysLeft: 5 });
  });

  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "", "ACTIVE", " active"])(
    "%j does not count as paid",
    (status) => {
      expect(isPaidSubscriptionStatus(status)).toBe(false);
      expect(onTrial(END, status).state).toBe("expired");
    }
  );
});

describe("resolveEntitlement — timezone independence", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("the same instant written with different offsets resolves identically", () => {
    const now = START + 3 * DAY;
    const expected = onTrial(now);
    for (const trialStartedAt of [
      "2026-09-13T11:30:00-04:00",
      "2026-09-14T00:30:00+09:00",
      "2026-09-13T15:30:00Z",
      "2026-09-13T15:30:00.000000+00:00", // PostgREST, microseconds
      "2026-09-13 15:30:00+00", // Postgres text format
    ]) {
      expect(resolveEntitlement({ trialStartedAt, subscriptionStatus: null }, now)).toEqual(expected);
    }
  });

  it("gives the same answers whatever timezone the host runs in", () => {
    const zones = ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Chatham"];
    const moments = [START, START + DAY - 1, START + 6 * DAY + 1, END - 1, END];

    const offsets = new Set<number>();
    const answers = zones.map((tz) => {
      process.env.TZ = tz;
      offsets.add(new Date(START).getTimezoneOffset());
      return moments.map((now) => onTrial(now));
    });

    // Guard against a vacuous pass: the zones really did change under us.
    expect(offsets.size).toBe(zones.length);
    for (const answer of answers) expect(answer).toEqual(answers[0]);
  });

  it("reads a timestamp with no offset as UTC, not host-local time", () => {
    for (const tz of ["UTC", "America/New_York", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      const e = resolveEntitlement({ trialStartedAt: "2026-09-13T15:30:00", subscriptionStatus: null }, START);
      expect(e.trialEndsAt).toBe(ENDS_AT);
      expect(e.daysLeft).toBe(7);
    }
  });

  it("a DST change inside the trial neither stretches nor shrinks it", () => {
    // US clocks spring forward on 2026-03-08. A trial started at noon New York
    // time on 03-05 ends 168 hours later: 1pm local on 03-12, not noon.
    process.env.TZ = "America/New_York";
    const startedAt = "2026-03-05T12:00:00-05:00";
    const opened = resolveEntitlement({ trialStartedAt: startedAt, subscriptionStatus: null }, Date.parse(startedAt));

    expect(opened.trialEndsAt).toBe("2026-03-12T17:00:00.000Z");
    expect(Date.parse(opened.trialEndsAt!) - Date.parse(startedAt)).toBe(168 * HOUR);
    expect(
      resolveEntitlement({ trialStartedAt: startedAt, subscriptionStatus: null }, Date.parse("2026-03-12T16:59:59.999Z"))
        .state
    ).toBe("trial");
    expect(
      resolveEntitlement({ trialStartedAt: startedAt, subscriptionStatus: null }, Date.parse("2026-03-12T17:00:00.000Z"))
        .state
    ).toBe("expired");
  });
});

describe("entitlementAt — re-evaluating a resolved entitlement later", () => {
  it("a trial counts down and expires on the same boundary", () => {
    const resolved = onTrial(START);
    expect(entitlementAt(resolved, START + DAY)).toEqual(onTrial(START + DAY));
    expect(entitlementAt(resolved, END - 1)).toEqual({ state: "trial", trialEndsAt: ENDS_AT, daysLeft: 1 });
    expect(entitlementAt(resolved, END)).toEqual({ state: "expired", trialEndsAt: ENDS_AT, daysLeft: 0 });
  });

  it("leaves states the clock can't change untouched", () => {
    const states: Entitlement[] = [
      { state: "grandfathered", trialEndsAt: null, daysLeft: null },
      { state: "paid", trialEndsAt: ENDS_AT, daysLeft: null },
      // A client clock running behind must not revive a trial the server ended.
      { state: "expired", trialEndsAt: ENDS_AT, daysLeft: 0 },
    ];
    for (const e of states) expect(entitlementAt(e, START)).toBe(e);
  });
});

describe("isTrialExemptPath", () => {
  it.each(["/settings/billing", "/settings/billing/anything", "/workspaces/new"])("%s stays reachable", (path) => {
    expect(isTrialExemptPath(path)).toBe(true);
  });

  it.each(["/", "/inventory", "/settings", "/settings/members", "/settings/billing-history", "/workspaces", "/workspaces/newer"])(
    "%s is gated",
    (path) => {
      expect(isTrialExemptPath(path)).toBe(false);
    }
  );
});

describe("formatDaysLeft", () => {
  it("pluralizes", () => {
    expect(formatDaysLeft(1)).toBe("1 day left");
    expect(formatDaysLeft(7)).toBe("7 days left");
  });
});
