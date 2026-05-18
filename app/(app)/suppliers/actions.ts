"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PaymentTerms } from "../customers/types";
import type { Supplier, SupplierInput } from "./types";

async function getOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as const };
  const { data: m } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!m) return { error: "No workspace" as const };
  return { supabase, user, orgId: m.org_id as string, role: m.role as string };
}

const VALID_PAYMENT_TERMS: PaymentTerms[] = [
  "cod",
  "due_on_receipt",
  "net_15",
  "net_30",
  "net_60",
  "net_90",
];

function validateSupplierInput(input: SupplierInput): string | null {
  if (!input.name?.trim()) return "Name is required";
  if (input.name.length > 200) return "Name is too long (max 200)";
  if (input.email && !input.email.includes("@")) return "Email looks invalid";
  if (
    input.default_lead_time_days !== null &&
    input.default_lead_time_days !== undefined &&
    input.default_lead_time_days < 0
  ) {
    return "Lead time must be 0 or greater";
  }
  if (!VALID_PAYMENT_TERMS.includes(input.payment_terms)) {
    return "Invalid payment terms";
  }
  return null;
}

// ── List ────────────────────────────────────────────────────────────────

export async function listSuppliers(
  opts: { includeInactive?: boolean } = {}
): Promise<{ error?: string; suppliers?: Supplier[] }> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  let q = ctx.supabase
    .from("suppliers")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("name");

  if (!opts.includeInactive) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) return { error: error.message };
  return { suppliers: (data ?? []) as Supplier[] };
}

// ── Detail (with recent POs + count) ────────────────────────────────────

interface RecentPO {
  id: string;
  po_number: string | null;
  status: string;
  expected_date: string | null;
  created_at: string;
}

export async function getSupplier(id: string): Promise<{
  error?: string;
  supplier?: Supplier;
  recentPOs?: RecentPO[];
  stats?: { poCount: number };
}> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  const { data: supplier, error } = await ctx.supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!supplier) return { error: "Supplier not found" };

  const [{ data: pos }, { count }] = await Promise.all([
    ctx.supabase
      .from("purchase_orders")
      .select("id, po_number, status, expected_date, created_at")
      .eq("supplier_id", id)
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .limit(10),
    ctx.supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", id)
      .eq("org_id", ctx.orgId),
  ]);

  return {
    supplier: supplier as Supplier,
    recentPOs: (pos ?? []) as RecentPO[],
    stats: { poCount: count ?? 0 },
  };
}

// ── Create ──────────────────────────────────────────────────────────────

export async function createSupplier(
  input: SupplierInput
): Promise<{ error?: string; id?: string }> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  const v = validateSupplierInput(input);
  if (v) return { error: v };

  const { data, error } = await ctx.supabase
    .from("suppliers")
    .insert({
      org_id: ctx.orgId,
      name: input.name.trim(),
      contact_name: input.contact_name?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      website: input.website?.trim() || null,
      address_line1: input.address_line1?.trim() || null,
      address_line2: input.address_line2?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      zip: input.zip?.trim() || null,
      country: input.country?.trim() || "US",
      tax_id: input.tax_id?.trim() || null,
      account_number: input.account_number?.trim() || null,
      payment_terms: input.payment_terms,
      default_lead_time_days: input.default_lead_time_days ?? null,
      notes: input.notes?.trim() || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/suppliers");
  return { id: data.id };
}

// ── Update ──────────────────────────────────────────────────────────────

export async function updateSupplier(
  id: string,
  input: SupplierInput
): Promise<{ error?: string }> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  const v = validateSupplierInput(input);
  if (v) return { error: v };

  const { error } = await ctx.supabase
    .from("suppliers")
    .update({
      name: input.name.trim(),
      contact_name: input.contact_name?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      website: input.website?.trim() || null,
      address_line1: input.address_line1?.trim() || null,
      address_line2: input.address_line2?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      zip: input.zip?.trim() || null,
      country: input.country?.trim() || "US",
      tax_id: input.tax_id?.trim() || null,
      account_number: input.account_number?.trim() || null,
      payment_terms: input.payment_terms,
      default_lead_time_days: input.default_lead_time_days ?? null,
      notes: input.notes?.trim() || null,
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
    })
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { error: error.message };

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return {};
}

// ── Soft activate/deactivate ────────────────────────────────────────────

export async function setSupplierActive(
  id: string,
  active: boolean
): Promise<{ error?: string }> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  const { error } = await ctx.supabase
    .from("suppliers")
    .update({ is_active: active })
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { error: error.message };

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return {};
}

// ── Search (for PO picker workflow) ─────────────────────────────────────

export async function searchSuppliers({ query }: { query: string }): Promise<{
  error?: string;
  suppliers?: Pick<
    Supplier,
    "id" | "name" | "contact_name" | "email" | "phone"
  >[];
}> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  const q = query.replace(/[,()]/g, " ").trim();
  if (q.length < 1) return { suppliers: [] };

  const escaped = q.replace(/[%_]/g, "\\$&");
  const { data, error } = await ctx.supabase
    .from("suppliers")
    .select("id, name, contact_name, email, phone")
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .or(
      `name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`
    )
    .order("name")
    .limit(10);

  if (error) return { error: error.message };
  return { suppliers: (data ?? []) as any };
}
