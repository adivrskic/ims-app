import { describe, it, expect } from "vitest";
import {
  slugify,
  parseEmails,
  parseEmailsDetailed,
  MAX_INVITES,
} from "@/lib/workspace/helpers";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Acme Flooring Supply")).toBe("acme-flooring-supply");
  });

  it("strips leading/trailing separators", () => {
    expect(slugify("  --Acme!  ")).toBe("acme");
  });

  it("caps at 60 characters", () => {
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(60);
  });

  it("falls back to ws-<hex> when the name strips to empty", () => {
    // This is the drift the old /admin/onboard inline copy lost — a
    // symbols-only or non-Latin name must never produce an empty slug.
    expect(slugify("!!!")).toMatch(/^ws-[0-9a-f]{6}$/);
    expect(slugify("日本語")).toMatch(/^ws-[0-9a-f]{6}$/);
  });
});

describe("parseEmails", () => {
  it("splits on commas, semicolons, and whitespace", () => {
    expect(parseEmails("a@x.com, b@x.com; c@x.com\nd@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
  });

  it("drops non-emails and lowercases", () => {
    expect(parseEmails("Not-an-email, OPS@Acme.COM")).toEqual(["ops@acme.com"]);
  });

  it("dedupes case-insensitively", () => {
    expect(parseEmails("a@x.com, A@X.com")).toEqual(["a@x.com"]);
  });

  it("excludes the inviter's own email case-insensitively", () => {
    // The old inline copies compared raw user.email against lowercased
    // input, so a mixed-case account email could invite itself.
    expect(parseEmails("Me@Acme.com, b@x.com", "me@acme.COM")).toEqual([
      "b@x.com",
    ]);
  });

  it("caps at MAX_INVITES", () => {
    const raw = Array.from({ length: 30 }, (_, i) => `u${i}@x.com`).join(",");
    expect(parseEmails(raw)).toHaveLength(MAX_INVITES);
  });

  it("returns empty for empty/garbage input", () => {
    expect(parseEmails("")).toEqual([]);
    expect(parseEmails("   ,;  ")).toEqual([]);
  });
});

describe("parseEmailsDetailed", () => {
  it("reports how many addresses the cap dropped", () => {
    const raw = Array.from({ length: 25 }, (_, i) => `u${i}@x.com`).join(",");
    const { emails, overflow } = parseEmailsDetailed(raw);
    expect(emails).toHaveLength(MAX_INVITES);
    expect(overflow).toBe(5);
  });

  it("reports no overflow at or under the cap", () => {
    expect(parseEmailsDetailed("a@x.com, b@x.com").overflow).toBe(0);
    expect(parseEmailsDetailed("").overflow).toBe(0);
  });

  it("counts overflow after dedupe and self-exclusion, not before", () => {
    const raw = [
      ...Array.from({ length: 20 }, (_, i) => `u${i}@x.com`),
      "u0@x.com",
      "ME@acme.com",
    ].join(",");
    expect(parseEmailsDetailed(raw, "me@acme.com").overflow).toBe(0);
  });
});
