import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bill-of-materials helpers for multi-level kits.
 *
 * A kit's BOM lives in `kit_components` (kit_product_id → component_product_id ×
 * quantity). A component can itself be a kit, so the BOM is a tree (a DAG in
 * general). These helpers load the org's BOM graph once and walk it in memory
 * with cycle + depth guards — org BOM graphs are small.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

const MAX_DEPTH = 12;

interface Edge {
  componentId: string;
  quantity: number;
}

export interface ProductMeta {
  id: string;
  name: string;
  sku: string | null;
  isKit: boolean;
}

/** kitProductId → its direct component edges. */
async function loadBomGraph(
  supabase: Client,
  orgId: string
): Promise<Map<string, Edge[]>> {
  const { data } = await supabase
    .from("kit_components")
    .select("kit_product_id, component_product_id, quantity")
    .eq("org_id", orgId);
  const graph = new Map<string, Edge[]>();
  for (const r of (data ?? []) as Array<{
    kit_product_id: string;
    component_product_id: string;
    quantity: number | null;
  }>) {
    const arr = graph.get(r.kit_product_id) ?? [];
    arr.push({ componentId: r.component_product_id, quantity: r.quantity ?? 1 });
    graph.set(r.kit_product_id, arr);
  }
  return graph;
}

async function loadProductMeta(
  supabase: Client,
  orgId: string,
  ids: string[]
): Promise<Map<string, ProductMeta>> {
  const out = new Map<string, ProductMeta>();
  if (ids.length === 0) return out;
  const { data } = await supabase
    .from("products")
    .select("id, name, internal_sku, is_kit")
    .eq("org_id", orgId)
    .in("id", [...new Set(ids)]);
  for (const p of (data ?? []) as Array<{
    id: string;
    name: string | null;
    internal_sku: string | null;
    is_kit: boolean | null;
  }>) {
    out.set(p.id, {
      id: p.id,
      name: p.name ?? "Unknown product",
      sku: p.internal_sku,
      isKit: Boolean(p.is_kit),
    });
  }
  return out;
}

// ── BOM tree (for display) ─────────────────────────────────────────────────

export interface BomNode {
  productId: string;
  name: string;
  sku: string | null;
  isKit: boolean;
  /** Quantity of this component per one unit of its immediate parent. */
  qtyPerParent: number;
  /** Quantity per one unit of the tree root (extended down the path). */
  qtyPerRoot: number;
  depth: number;
  /** True when this node would recurse into an ancestor (cycle stopped here). */
  cycle: boolean;
  /** True when children were omitted because MAX_DEPTH was reached (not a cycle). */
  truncated: boolean;
  children: BomNode[];
}

export async function getBomTree(
  supabase: Client,
  orgId: string,
  rootProductId: string
): Promise<BomNode | null> {
  const graph = await loadBomGraph(supabase, orgId);

  // Collect every product id reachable from the root for one metadata query.
  const involved = new Set<string>([rootProductId]);
  const collect = (id: string, seen: Set<string>, depth: number) => {
    if (depth > MAX_DEPTH || seen.has(id)) return;
    seen.add(id);
    for (const e of graph.get(id) ?? []) {
      involved.add(e.componentId);
      collect(e.componentId, seen, depth + 1);
    }
    seen.delete(id);
  };
  collect(rootProductId, new Set<string>(), 0);

  const meta = await loadProductMeta(supabase, orgId, [...involved]);
  const rootMeta = meta.get(rootProductId);
  if (!rootMeta) return null;

  const build = (
    id: string,
    qtyPerParent: number,
    qtyPerRoot: number,
    depth: number,
    path: Set<string>
  ): BomNode => {
    const m = meta.get(id);
    const node: BomNode = {
      productId: id,
      name: m?.name ?? "Unknown product",
      sku: m?.sku ?? null,
      isKit: m?.isKit ?? false,
      qtyPerParent,
      qtyPerRoot,
      depth,
      cycle: false,
      truncated: false,
      children: [],
    };
    if (path.has(id) || depth >= MAX_DEPTH) {
      // Distinguish a cycle stop from a depth-limit stop, and only flag
      // truncation when there were real children we declined to expand.
      if (path.has(id)) node.cycle = true;
      else node.truncated = (graph.get(id)?.length ?? 0) > 0;
      return node;
    }
    const nextPath = new Set(path).add(id);
    for (const e of graph.get(id) ?? []) {
      node.children.push(
        build(
          e.componentId,
          e.quantity,
          qtyPerRoot * e.quantity,
          depth + 1,
          nextPath
        )
      );
    }
    return node;
  };

  return build(rootProductId, 1, 1, 0, new Set<string>());
}

// NOTE: a BOM-explosion-to-leaves helper (explodeBom) was removed here — it was
// dead code that implied a multi-level auto-build capability the system doesn't
// have (work orders snapshot and consume only the DIRECT BOM; sub-assemblies must
// be pre-built via their own work orders). Re-add it only alongside real
// multi-level planning. See docs/audit-followups.md.

// ── Cycle guard for BOM editing ────────────────────────────────────────────

/**
 * Would adding `componentId` as a direct component of `kitId` create a cycle?
 * True when componentId === kitId, or kitId is reachable from componentId in
 * the existing BOM graph (i.e. componentId already contains kitId somewhere
 * below it).
 */
export async function bomCreatesCycle(
  supabase: Client,
  orgId: string,
  kitId: string,
  componentId: string
): Promise<boolean> {
  if (kitId === componentId) return true;
  const graph = await loadBomGraph(supabase, orgId);
  const stack = [componentId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop() as string;
    if (id === kitId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of graph.get(id) ?? []) stack.push(e.componentId);
  }
  return false;
}
