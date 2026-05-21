"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_ROLES = ["owner", "admin", "member"] as const;
type Role = (typeof VALID_ROLES)[number];

/* ============================================================
 * Helpers
 * ============================================================ */

async function getCallerRole(orgId: string): Promise<{
  userId: string;
  role: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!membership) return null;
  return { userId: user.id, role: membership.role };
}

/**
 * Minimal CSV parser — handles quoted cells, escaped quotes, and
 * commas inside quotes. Doesn't handle literal newlines inside
 * quoted cells (rare for our schema and would complicate ~50 LoC).
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/* ============================================================
 * Single-invite + role management (unchanged from prior batch)
 * ============================================================ */

export interface InviteResult {
  error?: string;
  success?: string;
}

export async function inviteMember(
  _prev: InviteResult | undefined,
  formData: FormData
): Promise<InviteResult> {
  const orgId = String(formData.get("org_id") ?? "");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "member");

  if (!orgId) return { error: "Missing org" };
  if (!email) return { error: "Email is required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Not a valid email address" };
  }
  if (!VALID_ROLES.includes(role as Role)) return { error: "Invalid role" };

  const caller = await getCallerRole(orgId);
  if (!caller) return { error: "Not a member of this workspace" };
  if (caller.role !== "owner" && caller.role !== "admin") {
    return { error: "Only owners and admins can invite members" };
  }
  if (caller.role === "admin" && role === "owner") {
    return { error: "Only owners can invite new owners" };
  }

  const admin = createAdminClient();

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    const { data: existingMembership } = await admin
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", existingProfile.id)
      .maybeSingle();

    if (existingMembership) {
      return { error: `${email} is already a member of this workspace` };
    }

    const { error: memberError } = await admin.from("org_members").insert({
      org_id: orgId,
      user_id: existingProfile.id,
      role,
    });
    if (memberError) {
      return { error: `Failed to add member: ${memberError.message}` };
    }
    revalidatePath("/settings/team");
    return { success: `${email} added to the workspace as ${role}` };
  }

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    h.get("origin") ??
    "https://app.Nautilus.io";
  const redirectTo = `${origin}/auth/callback?next=/`;

  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (inviteError || !inviteData?.user) {
    return {
      error: `Failed to send invite: ${
        inviteError?.message ?? "unknown error"
      }`,
    };
  }

  const newUser = inviteData.user;

  const { error: profileError } = await admin.from("profiles").insert({
    id: newUser.id,
    email,
    full_name: null,
    is_staff: false,
  });
  if (profileError) {
    return {
      error: `Profile insert failed: ${profileError.message}. The auth user was created but is orphaned — contact support.`,
    };
  }

  const { error: memberError } = await admin.from("org_members").insert({
    org_id: orgId,
    user_id: newUser.id,
    role,
  });
  if (memberError) {
    await admin.from("profiles").delete().eq("id", newUser.id);
    return { error: `Membership insert failed: ${memberError.message}` };
  }

  revalidatePath("/settings/team");
  return { success: `Invite sent to ${email} as ${role}` };
}

export async function updateMemberRole(formData: FormData): Promise<void> {
  const orgId = String(formData.get("org_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!orgId || !userId) return;
  if (!VALID_ROLES.includes(role as Role)) return;

  const caller = await getCallerRole(orgId);
  if (!caller) return;
  if (caller.role !== "owner") return;

  const admin = createAdminClient();

  if (role !== "owner") {
    const { data: owners } = await admin
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("role", "owner");
    if ((owners ?? []).length === 1 && owners![0].user_id === userId) return;
  }

  await admin
    .from("org_members")
    .update({ role })
    .eq("org_id", orgId)
    .eq("user_id", userId);

  revalidatePath("/settings/team");
}

export async function removeMember(formData: FormData): Promise<void> {
  const orgId = String(formData.get("org_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!orgId || !userId) return;

  const caller = await getCallerRole(orgId);
  if (!caller) return;
  if (caller.role !== "owner" && caller.role !== "admin") return;

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) return;
  if (caller.role === "admin" && target.role === "owner") return;

  if (target.role === "owner") {
    const { data: owners } = await admin
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("role", "owner");
    if ((owners ?? []).length <= 1) return;
  }

  await admin
    .from("org_members")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", userId);

  revalidatePath("/settings/team");
}

/* ============================================================
 * Bulk invite — preview + execute
 * ============================================================ */

export type BulkRowStatus =
  | "new" // will create auth user + send invite email
  | "existing_user" // already in Nautilus elsewhere; will add to this org (no email)
  | "already_member" // already in this org; will skip
  | "error"; // validation failed; will skip

export interface BulkPreviewRow {
  row_number: number;
  email: string;
  full_name: string;
  role: string;
  phone: string;
  facility: string;
  status: BulkRowStatus;
  message?: string;
}

export interface BulkPreviewResult {
  rows: BulkPreviewRow[];
  summary: {
    total: number;
    new_users: number;
    existing_users: number;
    already_members: number;
    errors: number;
  };
  fatal_error?: string; // file-level (parse failed, no auth, etc.)
}

export interface BulkExecuteResult {
  invited: number; // new auth users + invite emails sent
  added: number; // existing users added to this org
  failed: number;
  errors: Array<{ row: number; email: string; message: string }>;
  /** Magic links from the invite responses — for sales to copy-paste if
   *  any email gets stuck. Same order as new-user rows in the input. */
  magic_links: Array<{ email: string; action_link: string | null }>;
}

const MAX_BULK_ROWS = 200; // hard cap to avoid runaway calls
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Parse + validate a team CSV. Returns per-row status without touching
 * the database. Pure read except for the existence checks against
 * profiles/org_members.
 *
 * CSV columns (header-matched, any order):
 *   email          required
 *   role           required: owner | admin | member
 *   full_name      optional
 *   phone          optional
 *   facility       optional (warehouse name or slug)
 */
export async function previewBulkInvite(
  formData: FormData
): Promise<BulkPreviewResult> {
  const orgId = String(formData.get("org_id") ?? "");
  const file = formData.get("file") as File | null;

  const empty: BulkPreviewResult = {
    rows: [],
    summary: {
      total: 0,
      new_users: 0,
      existing_users: 0,
      already_members: 0,
      errors: 0,
    },
  };

  if (!orgId) return { ...empty, fatal_error: "Missing workspace" };
  if (!file || file.size === 0) {
    return { ...empty, fatal_error: "No file uploaded" };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ...empty,
      fatal_error: `File exceeds 2MB limit (${(file.size / 1024 / 1024).toFixed(
        1
      )}MB)`,
    };
  }

  const caller = await getCallerRole(orgId);
  if (!caller) {
    return { ...empty, fatal_error: "Not a member of this workspace" };
  }
  if (caller.role !== "owner" && caller.role !== "admin") {
    return { ...empty, fatal_error: "Only owners and admins can bulk-invite" };
  }

  const text = await file.text();
  const csvRows = parseCsv(text).filter((r) =>
    r.some((c) => c.trim().length > 0)
  );
  if (csvRows.length === 0) {
    return { ...empty, fatal_error: "Empty CSV" };
  }

  const headers = csvRows[0].map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_")
  );
  const dataRows = csvRows.slice(1);

  if (dataRows.length > MAX_BULK_ROWS) {
    return {
      ...empty,
      fatal_error: `Row count exceeds ${MAX_BULK_ROWS}. Split the file and re-upload.`,
    };
  }

  const idx = (name: string) => headers.indexOf(name);
  const iEmail = idx("email");
  const iName = idx("full_name");
  const iRole = idx("role");
  const iPhone = idx("phone");
  const iFacility = idx("facility");

  if (iEmail < 0) {
    return { ...empty, fatal_error: "Missing required column: email" };
  }
  if (iRole < 0) {
    return { ...empty, fatal_error: "Missing required column: role" };
  }

  const admin = createAdminClient();

  // Pre-fetch existing profiles + memberships + facilities in batches
  const emails = dataRows
    .map((r) => (r[iEmail] ?? "").trim().toLowerCase())
    .filter(Boolean);

  const { data: existingProfiles } = await admin
    .from("profiles")
    .select("id, email")
    .in("email", emails);
  const profileMap = new Map(
    (existingProfiles ?? []).map((p) => [p.email.toLowerCase(), p.id])
  );

  const existingIds = (existingProfiles ?? []).map((p) => p.id);
  const { data: orgMembers } = existingIds.length
    ? await admin
        .from("org_members")
        .select("user_id")
        .eq("org_id", orgId)
        .in("user_id", existingIds)
    : { data: [] };
  const memberSet = new Set((orgMembers ?? []).map((m) => m.user_id));

  let facilityMap: Map<string, string> | null = null;
  if (iFacility >= 0) {
    const { data: warehouses } = await admin
      .from("warehouses")
      .select("id, name, slug")
      .eq("org_id", orgId);
    facilityMap = new Map();
    for (const w of warehouses ?? []) {
      facilityMap.set(w.name.toLowerCase(), w.id);
      if (w.slug) facilityMap.set(w.slug.toLowerCase(), w.id);
    }
  }

  // Validate each row
  const rows: BulkPreviewRow[] = [];
  const seenInFile = new Set<string>();
  let newUsers = 0;
  let existingUsers = 0;
  let alreadyMembers = 0;
  let errors = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const rowNumber = i + 2; // 1-based + header
    const email = (r[iEmail] ?? "").trim().toLowerCase();
    const fullName = iName >= 0 ? (r[iName] ?? "").trim() : "";
    const role = (r[iRole] ?? "").trim().toLowerCase();
    const phone = iPhone >= 0 ? (r[iPhone] ?? "").trim() : "";
    const facility = iFacility >= 0 ? (r[iFacility] ?? "").trim() : "";

    const base: BulkPreviewRow = {
      row_number: rowNumber,
      email,
      full_name: fullName,
      role,
      phone,
      facility,
      status: "error",
    };

    if (!email) {
      rows.push({ ...base, message: "Missing email" });
      errors++;
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rows.push({ ...base, message: "Invalid email format" });
      errors++;
      continue;
    }
    if (seenInFile.has(email)) {
      rows.push({ ...base, message: "Duplicate email in this file" });
      errors++;
      continue;
    }
    seenInFile.add(email);

    if (!VALID_ROLES.includes(role as Role)) {
      rows.push({
        ...base,
        message: `Invalid role "${role}". Must be owner, admin, or member.`,
      });
      errors++;
      continue;
    }
    if (caller.role === "admin" && role === "owner") {
      rows.push({
        ...base,
        message: "Admins can't invite owners (only owners can)",
      });
      errors++;
      continue;
    }
    if (facility && facilityMap && !facilityMap.has(facility.toLowerCase())) {
      rows.push({
        ...base,
        message: `Facility "${facility}" not found in this workspace`,
      });
      errors++;
      continue;
    }

    const existingUserId = profileMap.get(email);
    if (existingUserId) {
      if (memberSet.has(existingUserId)) {
        rows.push({
          ...base,
          status: "already_member",
          message: "Already a member of this workspace",
        });
        alreadyMembers++;
      } else {
        rows.push({
          ...base,
          status: "existing_user",
          message:
            "Existing Nautilus user — will be added to this workspace (no email)",
        });
        existingUsers++;
      }
    } else {
      rows.push({
        ...base,
        status: "new",
        message: "New user — will be invited by email",
      });
      newUsers++;
    }
  }

  return {
    rows,
    summary: {
      total: rows.length,
      new_users: newUsers,
      existing_users: existingUsers,
      already_members: alreadyMembers,
      errors,
    },
  };
}

/**
 * Execute the bulk invite. Re-parses the file (so the user can't tamper
 * with rows between preview and execute), then provisions every row
 * with status `new` or `existing_user`. Errors and already-members are
 * skipped per their preview status.
 */
export async function executeBulkInvite(
  formData: FormData
): Promise<BulkExecuteResult> {
  const preview = await previewBulkInvite(formData);

  const empty: BulkExecuteResult = {
    invited: 0,
    added: 0,
    failed: 0,
    errors: [],
    magic_links: [],
  };

  if (preview.fatal_error) {
    return {
      ...empty,
      failed: 1,
      errors: [{ row: 0, email: "", message: preview.fatal_error }],
    };
  }

  const orgId = String(formData.get("org_id") ?? "");
  const admin = createAdminClient();
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    h.get("origin") ??
    "https://app.Nautilus.io";
  const redirectTo = `${origin}/auth/callback?next=/`;

  let invited = 0;
  let added = 0;
  let failed = 0;
  const errors: Array<{ row: number; email: string; message: string }> = [];
  const magicLinks: Array<{ email: string; action_link: string | null }> = [];

  // Resolve facility map once for default_warehouse_id setting
  let facilityMap: Map<string, string> | null = null;
  const needsFacility = preview.rows.some((r) => r.facility);
  if (needsFacility) {
    const { data: warehouses } = await admin
      .from("warehouses")
      .select("id, name, slug")
      .eq("org_id", orgId);
    facilityMap = new Map();
    for (const w of warehouses ?? []) {
      facilityMap.set(w.name.toLowerCase(), w.id);
      if (w.slug) facilityMap.set(w.slug.toLowerCase(), w.id);
    }
  }

  for (const row of preview.rows) {
    if (row.status === "error" || row.status === "already_member") continue;

    const facilityId =
      row.facility && facilityMap
        ? facilityMap.get(row.facility.toLowerCase()) ?? null
        : null;

    try {
      if (row.status === "existing_user") {
        // Look up the user id
        const { data: profile } = await admin
          .from("profiles")
          .select("id")
          .eq("email", row.email)
          .maybeSingle();
        if (!profile) {
          failed++;
          errors.push({
            row: row.row_number,
            email: row.email,
            message: "Profile disappeared between preview and execute",
          });
          continue;
        }

        const { error: memberError } = await admin.from("org_members").insert({
          org_id: orgId,
          user_id: profile.id,
          role: row.role,
        });
        if (memberError) {
          failed++;
          errors.push({
            row: row.row_number,
            email: row.email,
            message: memberError.message,
          });
          continue;
        }

        // Update profile with name/phone/facility if provided + currently empty
        const profilePatch: Record<string, unknown> = {};
        if (row.full_name) profilePatch.full_name = row.full_name;
        if (row.phone) profilePatch.phone = row.phone;
        if (facilityId) profilePatch.default_warehouse_id = facilityId;
        if (Object.keys(profilePatch).length > 0) {
          await admin
            .from("profiles")
            .update(profilePatch)
            .eq("id", profile.id);
        }

        added++;
      } else {
        // New user — invite
        const { data: inviteData, error: inviteError } =
          await admin.auth.admin.inviteUserByEmail(row.email, {
            data: { full_name: row.full_name || null },
            redirectTo,
          });

        if (inviteError || !inviteData?.user) {
          failed++;
          errors.push({
            row: row.row_number,
            email: row.email,
            message: inviteError?.message ?? "Invite failed",
          });
          continue;
        }

        const newUser = inviteData.user;

        const { error: profileError } = await admin.from("profiles").insert({
          id: newUser.id,
          email: row.email,
          full_name: row.full_name || null,
          phone: row.phone || null,
          default_warehouse_id: facilityId,
          is_staff: false,
        });

        if (profileError) {
          failed++;
          errors.push({
            row: row.row_number,
            email: row.email,
            message: `Profile insert: ${profileError.message}`,
          });
          continue;
        }

        const { error: memberError } = await admin.from("org_members").insert({
          org_id: orgId,
          user_id: newUser.id,
          role: row.role,
        });

        if (memberError) {
          // Best-effort rollback so the auth user isn't fully orphaned
          await admin.from("profiles").delete().eq("id", newUser.id);
          failed++;
          errors.push({
            row: row.row_number,
            email: row.email,
            message: `Membership insert: ${memberError.message}`,
          });
          continue;
        }

        invited++;
        magicLinks.push({
          email: row.email,
          action_link: inviteData.properties?.action_link ?? null,
        });
      }
    } catch (err) {
      failed++;
      errors.push({
        row: row.row_number,
        email: row.email,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  revalidatePath("/settings/team");
  return { invited, added, failed, errors, magic_links: magicLinks };
}
