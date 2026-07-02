import { describe, it, expect } from "vitest";
import {
  effectivePermissions,
  defaultPermissionsFor,
  can,
  ALL_PERMISSIONS,
} from "@/lib/permissions";

describe("effectivePermissions (RBAC resolution)", () => {
  it("owners always get every permission, ignoring any custom set", () => {
    expect(effectivePermissions("owner", null).size).toBe(ALL_PERMISSIONS.length);
    // even an empty custom array can't strip an owner's access
    expect(effectivePermissions("owner", []).size).toBe(ALL_PERMISSIONS.length);
  });

  it("admins get every permission by default", () => {
    expect(effectivePermissions("admin", null).size).toBe(ALL_PERMISSIONS.length);
  });

  it("a non-null custom set overrides the role default", () => {
    const perms = effectivePermissions("member", ["inventory.adjust"]);
    expect([...perms]).toEqual(["inventory.adjust"]);
  });

  it("drops invalid permission keys from a custom set", () => {
    const perms = effectivePermissions("member", [
      "inventory.adjust",
      "not.a.real.permission",
    ]);
    expect(perms.has("inventory.adjust")).toBe(true);
    expect(perms.has("not.a.real.permission" as never)).toBe(false);
    expect(perms.size).toBe(1);
  });

  it("falls back to the role default when custom is null", () => {
    const perms = effectivePermissions("member", null);
    expect([...perms].sort()).toEqual([...defaultPermissionsFor("member")].sort());
  });

  it("treats an unknown role as a member (least privilege, not owner)", () => {
    const perms = effectivePermissions("wizard", null);
    expect(perms.size).toBe(defaultPermissionsFor("member").length);
    expect(perms.size).toBeLessThan(ALL_PERMISSIONS.length);
  });

  it("can() reflects set membership", () => {
    const perms = effectivePermissions("member", ["inventory.adjust"]);
    expect(can(perms, "inventory.adjust")).toBe(true);
    expect(can(perms, "members.manage")).toBe(false);
  });
});
