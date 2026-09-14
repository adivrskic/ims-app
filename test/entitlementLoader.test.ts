import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * lib/data/entitlement.ts is the loader every gate calls. Its one promise that
 * matters more than any other: when it can't read the two facts it needs, it
 * FAILS OPEN — a missing column (migration not applied yet), a PostgREST error
 * or a missing service-role key must never lock a workspace out. The service
 * role client is replaced with a scripted fake so each path runs without a
 * database or network.
 */

type Row = { data: unknown; error: { message: string } | null };

const db = vi.hoisted(() => ({
  org: { data: null, error: null } as Row,
  subscription: { data: null, error: null } as Row,
  clientError: null as Error | null,
}));

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (db.clientError) throw db.clientError;
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => (table === "orgs" ? db.org : db.subscription),
          }),
        }),
      }),
    };
  },
}));

import { getOrgEntitlement, isTrialExpired } from "@/lib/data/entitlement";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

beforeEach(() => {
  db.org = { data: { trial_started_at: null }, error: null };
  db.subscription = { data: null, error: null };
  db.clientError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getOrgEntitlement — reading the rows", () => {
  it("resolves a running trial from the org row", async () => {
    db.org = { data: { trial_started_at: daysAgo(1) }, error: null };
    const e = await getOrgEntitlement("org-trial");
    expect(e.state).toBe("trial");
    expect(e.daysLeft).toBe(6);
    expect(await isTrialExpired("org-trial")).toBe(false);
  });

  it("expires a lapsed clock with no subscription row", async () => {
    db.org = { data: { trial_started_at: daysAgo(8) }, error: null };
    expect((await getOrgEntitlement("org-lapsed")).state).toBe("expired");
    expect(await isTrialExpired("org-lapsed")).toBe(true);
  });

  it("lets a paid subscription through a lapsed clock", async () => {
    db.org = { data: { trial_started_at: daysAgo(30) }, error: null };
    db.subscription = { data: { status: "past_due" }, error: null };
    expect((await getOrgEntitlement("org-paid")).state).toBe("paid");
    expect(await isTrialExpired("org-paid")).toBe(false);
  });

  it("treats an existing workspace (NULL clock) as grandfathered", async () => {
    expect((await getOrgEntitlement("org-old")).state).toBe("grandfathered");
  });
});

describe("getOrgEntitlement — fails open", () => {
  it("when trial_started_at doesn't exist yet (app deployed before the migration)", async () => {
    db.org = {
      data: null,
      error: { message: "column orgs.trial_started_at does not exist" },
    };
    expect((await getOrgEntitlement("org-no-column")).state).toBe("grandfathered");
    expect(await isTrialExpired("org-no-column")).toBe(false);
  });

  it("when the subscription can't be read, even on a clock that ran out", async () => {
    db.org = { data: { trial_started_at: daysAgo(20) }, error: null };
    db.subscription = { data: null, error: { message: "permission denied" } };
    expect(await isTrialExpired("org-sub-error")).toBe(false);
  });

  it("when the org row is missing", async () => {
    db.org = { data: null, error: null };
    expect(await isTrialExpired("org-missing")).toBe(false);
  });

  it("when the admin client can't even be built (no service-role key)", async () => {
    db.clientError = new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    expect((await getOrgEntitlement("org-no-key")).state).toBe("grandfathered");
    expect(await isTrialExpired("org-no-key")).toBe(false);
  });

  it("and says so in the server log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.org = { data: null, error: { message: "a one-off failure for this test" } };
    await getOrgEntitlement("org-logged");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("failing open"));
  });
});
