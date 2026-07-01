"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/email/invite";

/**
 * Bulk team invite — CSV preview + execute. Relocated from the retired
 * /settings/team page so the feature is reachable from /settings/members.
 */

const VALID_ROLES = ["owner", "admin", "member"] as const;
type Role = (typeof VALID_ROLES)[number];

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
 * Minimal CSV parser — handles quoted cells, escaped quotes, and commas inside
 * quotes. Doesn't handle literal newlines inside quoted cells (rare for our
 * schema and would complicate ~50 LoC).
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

export type BulkRowStatus =
  | "new" // will create a token invite + email a join link
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
  invited: number; // new token invites created + emails sent
  added: number; // existing users added to this org
  failed: number;
  errors: Array<{ row: number; email: string; message: string }>;
  /** /invite/{token} join links — for sales to copy-paste if any email gets
   *  stuck. Same order as new-user rows in the input. (Field name kept as
   *  magic_links for backward compatibility with the result UI.) */
  magic_links: Array<{ email: string; action_link: string | null }>;
}

const MAX_BULK_ROWS = 200; // hard cap to avoid runaway calls
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Parse + validate a team CSV. Returns per-row status without touching the
 * database. Pure read except for the existence checks against
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
 * Execute the bulk invite. Re-parses the file (so the user can't tamper with
 * rows between preview and execute), then provisions every row with status
 * `new` or `existing_user`. Errors and already-members are skipped per their
 * preview status.
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? h.get("origin") ?? "";

  // Inviter + workspace context for the invite emails / links.
  const caller = await getCallerRole(orgId);
  if (!caller) {
    return {
      ...empty,
      failed: 1,
      errors: [
        { row: 0, email: "", message: "Not a member of this workspace" },
      ],
    };
  }
  const [{ data: orgRow }, { data: inviterProfile }] = await Promise.all([
    admin.from("orgs").select("name").eq("id", orgId).maybeSingle(),
    admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", caller.userId)
      .maybeSingle(),
  ]);
  const orgName = orgRow?.name ?? "the workspace";
  const inviterName =
    inviterProfile?.full_name ?? inviterProfile?.email ?? "A teammate";
  const inviterEmail = inviterProfile?.email ?? "";
  const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(expiresAtMs).toISOString();

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
        // New user — token invite + email a join link. No auth user or profile
        // is created up front; they sign up via /invite/{token} and
        // acceptInvite() creates membership. (CSV full_name/phone/facility are
        // NOT applied for new users — there's no profile yet; those are only
        // applied to existing users above.)
        const token = randomBytes(16).toString("hex");
        const { error: inviteError } = await admin.from("org_invites").insert({
          org_id: orgId,
          email: row.email,
          role: row.role,
          token,
          invited_by: caller.userId,
          expires_at: expiresAt,
        });

        let linkToken = token;
        if (inviteError) {
          if (inviteError.message.includes("duplicate")) {
            // A pending invite already exists — reuse its token so the run is
            // idempotent and still yields a shareable link.
            const { data: existing } = await admin
              .from("org_invites")
              .select("token")
              .eq("org_id", orgId)
              .eq("email", row.email)
              .maybeSingle();
            if (!existing?.token) {
              failed++;
              errors.push({
                row: row.row_number,
                email: row.email,
                message: inviteError.message,
              });
              continue;
            }
            linkToken = existing.token;
          } else {
            failed++;
            errors.push({
              row: row.row_number,
              email: row.email,
              message: inviteError.message,
            });
            continue;
          }
        } else {
          // Only email on a fresh insert (don't re-spam existing invites).
          await sendInviteEmail(orgId, {
            inviterName,
            inviterEmail,
            orgName,
            role: row.role,
            token,
            recipientEmail: row.email,
            expiresAt: new Date(expiresAtMs),
          }).catch((e) => console.error("[bulk-invite] email failed:", e));
        }

        invited++;
        magicLinks.push({
          email: row.email,
          action_link: `${appUrl}/invite/${linkToken}`,
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

  revalidatePath("/settings/members");
  return { invited, added, failed, errors, magic_links: magicLinks };
}
