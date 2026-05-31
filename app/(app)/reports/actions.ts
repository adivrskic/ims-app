"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { getDatasetMeta } from "@/lib/reports-meta";

export async function saveReport(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const name = String(formData.get("name") ?? "").trim();
  const dataset = String(formData.get("dataset") ?? "").trim();
  if (!name) return { error: "Name your report" };
  const meta = getDatasetMeta(dataset);
  if (!meta) return { error: "Pick a dataset" };

  const validKeys = new Set(meta.columns.map((c) => c.key));
  const columns = formData
    .getAll("column")
    .map(String)
    .filter((k) => validKeys.has(k));
  if (columns.length === 0) return { error: "Pick at least one column" };

  const validFilterKeys = new Set(meta.filters.map((f) => f.key));
  const filters: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("f_")) continue;
    const key = k.slice(2);
    if (!validFilterKeys.has(key)) continue;
    const val = String(v).trim();
    if (val !== "") filters[key] = val;
  }

  const { data, error } = await ctx.supabase
    .from("saved_reports")
    .insert({
      org_id: ctx.orgId,
      name,
      dataset,
      config: { columns, filters },
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to save" };

  revalidatePath("/reports");
  redirect(`/reports/${data.id}`);
}

export async function deleteReport(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await ctx.supabase
    .from("saved_reports")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath("/reports");
  redirect("/reports");
}
