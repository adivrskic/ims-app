import "server-only";

/**
 * Confirm that a client-supplied foreign id (a warehouse, product, supplier…)
 * belongs to the workspace the caller is acting on.
 *
 * WHY: several server actions stamp ids straight from the form into an insert
 * (`warehouse_id`, `product_id`, `supplier_id`…). RLS scopes the INSERT itself
 * to the caller's org, but it does not check that the *referenced* row is in
 * that org — so a crafted POST could attach a work order to another
 * workspace's facility, or a kit line to another workspace's product. One
 * cheap lookup closes that for every such insert.
 *
 * Returns true when a row with that id and org_id exists, false otherwise
 * (including when the id is empty or the query errors — fail closed).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any };

export async function assertOrgOwns(
  supabase: AnyClient,
  table: string,
  id: string | null | undefined,
  orgId: string
): Promise<boolean> {
  if (!id) return false;
  try {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}
