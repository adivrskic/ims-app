import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllPaged } from "@/lib/data/paginate";
import { tags } from "@/lib/cache-tags";
import { productVelocities } from "@/lib/data/velocity";
import { cycleRiskScore, type CountRecord } from "@/lib/cycle-risk";

/**
 * Cross-request cached fetcher for the Cycle Counts page.
 *
 * Bundles the page's parallel queries (form products, form locations,
 * filtered history, org-wide summary, plus a ranking history pull) and the
 * location rollup + summary math + discrepancy-risk prioritization, so
 * navigations serve from cache.
 *
 * Admin (service-role) client → BYPASSES RLS, so every query filters org_id
 * explicitly; the cache key includes org_id (plus the product/variance
 * filters that affect the history list).
 *
 * Tagged tags.cycleCounts(orgId) + tags.inventory(orgId):
 *   - recordCycleCount busts cycleCounts always, and inventory when a
 *     variance changed a location's on-hand.
 *   - voidCycleCount busts cycleCounts.
 *   - CycleCountsRealtime busts both (cycle_counts → [inventory, cycleCounts]).
 *   - Any location change (placements, adjustments) busts inventory, which
 *     also refreshes the form's "on hand" hints here.
 */

export interface CycleCountProductOption {
  id: string;
  name: string;
  barcode: string;
}

export interface CycleCountLocationOption {
  id: string;
  product_id: string;
  bay: number | null;
  level: number | null;
  quantity: number | null;
  section_code: string | null;
  warehouse_name: string | null;
}

/** A product surfaced in the "count next" list, ranked by discrepancy risk. */
export interface PrioritizedCount {
  product_id: string;
  product_name: string;
  barcode: string;
  score: number;
  reason: string;
  on_hand: number | null;
  days_since_last_count: number | null;
}

/** A pending row in the scheduled count queue. */
export interface CountQueueTask {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string;
  score: number;
  reason: string | null;
  due_date: string;
  created_at: string | null;
}

export interface CycleCountsPageData {
  products: CycleCountProductOption[];
  locations: CycleCountLocationOption[];
  /** History rows with embeds; the page casts these to its local Row type. */
  rows: unknown[];
  totalCounts: number;
  totalAdjustments: number;
  accuracyPct: number | null;
  netUnits: number;
  /** Discrepancy-risk-ranked "count next" list (highest risk first). */
  prioritized: PrioritizedCount[];
  /** Open tasks from the weekly scheduled queue, soonest due first. */
  queue: CountQueueTask[];
  /** orgs.auto_cycle_counts_enabled — drives the header toggle. */
  autoQueueEnabled: boolean;
}

// How far back to look when scoring discrepancy risk, and how many SKUs to
// surface in the "count next" list.
const RANKING_LOOKBACK_DAYS = 365;
const PRIORITIZED_LIMIT = 8;

export function getCycleCountsPageData(
  orgId: string,
  opts: { productId?: string | null; varianceOnly: boolean }
): Promise<CycleCountsPageData> {
  const productKey = opts.productId || "all";
  const varKey = opts.varianceOnly ? "variance" : "all";

  return unstable_cache(
    async (): Promise<CycleCountsPageData> => {
      const admin = createAdminClient();

      const rankingSince = new Date();
      rankingSince.setDate(rankingSince.getDate() - RANKING_LOOKBACK_DAYS);
      rankingSince.setHours(0, 0, 0, 0);

      const [
        { data: productsData },
        { data: locationsData },
        { data: counts },
        { data: totalCountsRow, count: totalCounts },
        { data: rankingData },
        { data: queueData },
        { data: orgRow },
      ] = await Promise.all([
        (async () => ({
          data: await fetchAllPaged<Record<string, unknown>>((from, to) =>
            admin
              .from("products")
              .select("id, name, barcode")
              .eq("org_id", orgId)
              .order("id", { ascending: true })
              .range(from, to)
          ),
        }))(),
        (async () => ({
          // Paginate: this feeds onHandByProduct — truncation understates the
          // on-hand hints and the risk-prioritization on-hand column.
          data: await fetchAllPaged<Record<string, unknown>>((from, to) =>
            admin
              .from("locations")
              .select(
                `id, product_id, bay, level, quantity,
                 section:sections ( code ),
                 warehouse:warehouses ( name )`
              )
              .eq("org_id", orgId)
              .not("product_id", "is", null)
              .order("id", { ascending: true })
              .range(from, to)
          ),
        }))(),
        (() => {
          let q = admin
            .from("cycle_counts")
            .select(
              `id, expected_qty, counted_qty, variance, status, counted_at, notes,
               product:products ( id, name, barcode ),
               location:locations (
                 bay, level,
                 section:sections ( code ),
                 warehouse:warehouses ( name )
               ),
               counter:profiles!cycle_counts_counted_by_fkey ( full_name, email )`
            )
            .eq("org_id", orgId)
            .order("counted_at", { ascending: false })
            .limit(100);
          if (opts.productId) q = q.eq("product_id", opts.productId);
          if (opts.varianceOnly) q = q.neq("variance", 0);
          return q;
        })(),
        admin
          .from("cycle_counts")
          .select("id, variance", { count: "exact" })
          .eq("org_id", orgId),
        // Unfiltered history across the org for risk scoring — independent of
        // the page's product/variance filters above.
        admin
          .from("cycle_counts")
          .select("product_id, variance, expected_qty, counted_at")
          .eq("org_id", orgId)
          .not("product_id", "is", null)
          .gte("counted_at", rankingSince.toISOString())
          .order("counted_at", { ascending: false })
          .limit(2000),
        // Scheduled count queue (pending tasks, soonest due first).
        admin
          .from("cycle_count_tasks")
          .select(
            "id, product_id, score, reason, due_date, created_at, product:products ( name, barcode )"
          )
          .eq("org_id", orgId)
          .eq("status", "pending")
          .order("due_date", { ascending: true })
          .order("score", { ascending: false })
          .limit(50),
        admin
          .from("orgs")
          .select("auto_cycle_counts_enabled")
          .eq("id", orgId)
          .maybeSingle(),
      ]);

      const products = ((productsData ?? []) as unknown as CycleCountProductOption[])
        .slice()
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

      const locations: CycleCountLocationOption[] = (
        (locationsData ?? []) as unknown as Array<{
          id: string;
          product_id: string | null;
          bay: number | null;
          level: number | null;
          quantity: number | null;
          section: { code: string | null } | { code: string | null }[] | null;
          warehouse: { name: string } | { name: string }[] | null;
        }>
      )
        .filter((l): l is typeof l & { product_id: string } => !!l.product_id)
        .map((l) => {
          const sec = Array.isArray(l.section) ? l.section[0] : l.section;
          const wh = Array.isArray(l.warehouse) ? l.warehouse[0] : l.warehouse;
          return {
            id: l.id,
            product_id: l.product_id,
            bay: l.bay,
            level: l.level,
            quantity: l.quantity,
            section_code: sec?.code?.trim() ?? null,
            warehouse_name: wh?.name ?? null,
          };
        });

      // Aggregate stats — across ALL counts in the org, not filter-affected.
      type SummaryRow = { id: string; variance: number };
      const allCounts = (totalCountsRow ?? []) as SummaryRow[];
      const totalAdjustments = allCounts.filter((c) => c.variance !== 0).length;
      const accuracyPct =
        (totalCounts ?? 0) > 0
          ? Math.round((1 - totalAdjustments / (totalCounts ?? 1)) * 100)
          : null;
      const netUnits = allCounts.reduce((s, c) => s + c.variance, 0);

      // ── Discrepancy-risk prioritization (§2c) ──────────────────────────
      // Group the unfiltered history by product, score each via cycle-risk
      // (weighted by the shared 60-day velocity), and rank highest-risk first.
      type RankRow = {
        product_id: string | null;
        variance: number | null;
        expected_qty: number | null;
        counted_at: string | null;
      };
      const historyByProduct = new Map<string, CountRecord[]>();
      const lastCountByProduct = new Map<string, string>();
      for (const r of (rankingData ?? []) as RankRow[]) {
        if (!r.product_id || !r.counted_at) continue;
        const rec: CountRecord = {
          variance: r.variance ?? 0,
          expectedQty: r.expected_qty ?? 0,
          countedAt: r.counted_at,
        };
        const arr = historyByProduct.get(r.product_id);
        if (arr) arr.push(rec);
        else historyByProduct.set(r.product_id, [rec]);
        // rankingData is ordered counted_at desc, so the first seen is latest.
        if (!lastCountByProduct.has(r.product_id)) {
          lastCountByProduct.set(r.product_id, r.counted_at);
        }
      }

      const productIdsWithHistory = [...historyByProduct.keys()];
      const velocities = await productVelocities(admin, {
        productIds: productIdsWithHistory,
      });

      const onHandByProduct = new Map<string, number>();
      for (const l of locations) {
        onHandByProduct.set(
          l.product_id,
          (onHandByProduct.get(l.product_id) ?? 0) + (l.quantity ?? 0)
        );
      }

      const productById = new Map(products.map((p) => [p.id, p]));

      const prioritized: PrioritizedCount[] = productIdsWithHistory
        .map((pid) => {
          const risk = cycleRiskScore({
            history: historyByProduct.get(pid)!,
            velocity: velocities.get(pid) ?? 0,
          });
          const p = productById.get(pid);
          return {
            product_id: pid,
            product_name: p?.name ?? "Unknown product",
            barcode: p?.barcode ?? "",
            score: risk.score,
            reason: risk.reason,
            on_hand: onHandByProduct.get(pid) ?? null,
            days_since_last_count: risk.daysSinceLastCount,
          };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, PRIORITIZED_LIMIT);

      const queue: CountQueueTask[] = (
        (queueData ?? []) as unknown as Array<{
          id: string;
          product_id: string;
          score: number | string;
          reason: string | null;
          due_date: string;
          created_at: string | null;
          product:
            | { name: string | null; barcode: string | null }
            | { name: string | null; barcode: string | null }[]
            | null;
        }>
      ).map((t) => {
        const p = Array.isArray(t.product) ? t.product[0] : t.product;
        return {
          id: t.id,
          product_id: t.product_id,
          product_name: p?.name ?? "Unknown product",
          barcode: p?.barcode ?? "",
          score: Number(t.score),
          reason: t.reason,
          due_date: t.due_date,
          created_at: t.created_at,
        };
      });

      return {
        products,
        locations,
        rows: (counts ?? []) as unknown[],
        totalCounts: totalCounts ?? 0,
        totalAdjustments,
        accuracyPct,
        netUnits,
        prioritized,
        queue,
        autoQueueEnabled:
          (orgRow as { auto_cycle_counts_enabled?: boolean } | null)
            ?.auto_cycle_counts_enabled ?? false,
      };
    },
    ["cycle-counts-page", orgId, productKey, varKey],
    { tags: [tags.cycleCounts(orgId), tags.inventory(orgId)], revalidate: 300 }
  )();
}

// ── Scheduled queue: risk ranking for the weekly cron ─────────────────────

export interface CountPriority {
  product_id: string;
  score: number;
  reason: string;
}

/**
 * Rank the org's products by discrepancy risk for the scheduled count queue.
 * Same scoring as the page's "count next" list, with one addition: products
 * that have NEVER been counted but hold stock are candidates too (they score
 * the never-counted baseline, weighted by velocity), so a fresh org's queue
 * isn't empty just because it has no count history yet.
 *
 * Admin client (cron has no session); every query filters org_id.
 */
export async function rankCountPriorities(
  orgId: string,
  limit: number
): Promise<CountPriority[]> {
  const admin = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - RANKING_LOOKBACK_DAYS);
  since.setHours(0, 0, 0, 0);

  const [{ data: history }, { data: movement }] = await Promise.all([
    admin
      .from("cycle_counts")
      .select("product_id, variance, expected_qty, counted_at")
      .eq("org_id", orgId)
      .not("product_id", "is", null)
      .gte("counted_at", since.toISOString())
      .order("counted_at", { ascending: false })
      .limit(2000),
    admin.rpc("product_movement_stats", { p_org: orgId, p_warehouse: null }),
  ]);

  const historyByProduct = new Map<string, CountRecord[]>();
  for (const r of (history ?? []) as Array<{
    product_id: string | null;
    variance: number | null;
    expected_qty: number | null;
    counted_at: string | null;
  }>) {
    if (!r.product_id || !r.counted_at) continue;
    const rec: CountRecord = {
      variance: r.variance ?? 0,
      expectedQty: r.expected_qty ?? 0,
      countedAt: r.counted_at,
    };
    const arr = historyByProduct.get(r.product_id);
    if (arr) arr.push(rec);
    else historyByProduct.set(r.product_id, [rec]);
  }

  // Candidates: counted before, or currently holding stock.
  const candidates = new Set<string>(historyByProduct.keys());
  for (const m of (movement ?? []) as Array<{
    product_id: string;
    on_hand: number;
  }>) {
    if (Number(m.on_hand) > 0) candidates.add(m.product_id);
  }
  if (candidates.size === 0) return [];

  const ids = [...candidates];
  const velocities = await productVelocities(admin, { productIds: ids });

  return ids
    .map((pid) => {
      const risk = cycleRiskScore({
        history: historyByProduct.get(pid) ?? [],
        velocity: velocities.get(pid) ?? 0,
      });
      return { product_id: pid, score: risk.score, reason: risk.reason };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
