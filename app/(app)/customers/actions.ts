"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";
import type { Customer, CustomerInput, PaymentTerms } from "./types";

const VALID_PAYMENT_TERMS: PaymentTerms[] = [
  "cod",
  "due_on_receipt",
  "net_15",
  "net_30",
  "net_60",
  "net_90",
];

function validateCustomerInput(input: CustomerInput): string | null {
  if (!input.name?.trim()) return "Name is required";
  if (input.name.length > 200) return "Name is too long (max 200)";
  if (input.customer_type === "business" && !input.company_name?.trim()) {
    return "Company name is required for business customers";
  }
  if (input.email && !input.email.includes("@")) return "Email looks invalid";
  if (
    input.credit_limit !== null &&
    input.credit_limit !== undefined &&
    input.credit_limit < 0
  ) {
    return "Credit limit must be 0 or greater";
  }
  if (input.discount_percent < 0 || input.discount_percent > 100) {
    return "Discount must be 0–100";
  }
  if (!VALID_PAYMENT_TERMS.includes(input.payment_terms)) {
    return "Invalid payment terms";
  }
  return null;
}

// ── List ────────────────────────────────────────────────────────────────

export async function listCustomers(
  opts: { search?: string; includeInactive?: boolean } = {}
): Promise<{ error?: string; customers?: Customer[] }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  let q = ctx.supabase
    .from("customers")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("name");

  if (!opts.includeInactive) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) return { error: error.message };
  return { customers: (data ?? []) as Customer[] };
}

// ── Detail (with recent orders + count) ─────────────────────────────────

interface RecentOrder {
  id: string;
  order_number: string | null;
  order_type: string;
  status: string;
  delivery_date: string | null;
  created_at: string;
}

export async function getCustomer(id: string): Promise<{
  error?: string;
  customer?: Customer;
  recentOrders?: RecentOrder[];
  stats?: { orderCount: number };
}> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const { data: customer, error } = await ctx.supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!customer) return { error: "Customer not found" };

  const [{ data: orders }, { count }] = await Promise.all([
    ctx.supabase
      .from("orders")
      .select("id, order_number, order_type, status, delivery_date, created_at")
      .eq("customer_id", id)
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .limit(10),
    ctx.supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id)
      .eq("org_id", ctx.orgId),
  ]);

  return {
    customer: customer as Customer,
    recentOrders: (orders ?? []) as RecentOrder[],
    stats: { orderCount: count ?? 0 },
  };
}

// ── Create ──────────────────────────────────────────────────────────────

export async function createCustomer(
  input: CustomerInput
): Promise<{ error?: string; id?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const validation = validateCustomerInput(input);
  if (validation) return { error: validation };

  const { data, error } = await ctx.supabase
    .from("customers")
    .insert({
      org_id: ctx.orgId,
      name: input.name.trim(),
      company_name: input.company_name?.trim() || null,
      customer_type: input.customer_type,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address_line1: input.address_line1?.trim() || null,
      address_line2: input.address_line2?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      zip: input.zip?.trim() || null,
      country: input.country?.trim() || "US",
      tax_id: input.tax_id?.trim() || null,
      credit_limit: input.credit_limit ?? null,
      payment_terms: input.payment_terms,
      discount_percent: input.discount_percent,
      notes: input.notes?.trim() || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/customers");
  revalidateTag(tags.customers(ctx.orgId));
  return { id: data.id };
}

// ── Update ──────────────────────────────────────────────────────────────

export async function updateCustomer(
  id: string,
  input: CustomerInput
): Promise<{ error?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const validation = validateCustomerInput(input);
  if (validation) return { error: validation };

  const { error } = await ctx.supabase
    .from("customers")
    .update({
      name: input.name.trim(),
      company_name: input.company_name?.trim() || null,
      customer_type: input.customer_type,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address_line1: input.address_line1?.trim() || null,
      address_line2: input.address_line2?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      zip: input.zip?.trim() || null,
      country: input.country?.trim() || "US",
      tax_id: input.tax_id?.trim() || null,
      credit_limit: input.credit_limit ?? null,
      payment_terms: input.payment_terms,
      discount_percent: input.discount_percent,
      notes: input.notes?.trim() || null,
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
    })
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { error: error.message };

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidateTag(tags.customers(ctx.orgId));
  return {};
}

// ── Soft activate/deactivate ────────────────────────────────────────────

export async function setCustomerActive(
  id: string,
  active: boolean
): Promise<{ error?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const { error } = await ctx.supabase
    .from("customers")
    .update({ is_active: active })
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { error: error.message };

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidateTag(tags.customers(ctx.orgId));
  return {};
}

// ── Search (for pickers in order forms etc.) ────────────────────────────

export async function searchCustomers({ query }: { query: string }): Promise<{
  error?: string;
  customers?: Pick<
    Customer,
    "id" | "name" | "company_name" | "customer_type" | "email" | "phone"
  >[];
}> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const q = query.replace(/[,()]/g, " ").trim();
  if (q.length < 1) return { customers: [] };

  const escaped = q.replace(/[%_]/g, "\\$&");
  const { data, error } = await ctx.supabase
    .from("customers")
    .select("id, name, company_name, customer_type, email, phone")
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .or(
      `name.ilike.%${escaped}%,company_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`
    )
    .order("name")
    .limit(10);

  if (error) return { error: error.message };
  return { customers: (data ?? []) as any };
}
