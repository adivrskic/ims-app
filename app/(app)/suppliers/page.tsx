import { Plus } from "lucide-react";
import { CornerLink } from "@/components/ui/CornerButton";
import { SupplierList, type SupplierStatsMap } from "./SupplierList";
import { computeSupplierStats, type ScorecardPo } from "@/lib/supplier-stats";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getSuppliersPageData } from "@/lib/data/suppliers";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  // Suppliers + scorecard POs + product counts come from the cross-request
  // cache (lib/data/suppliers.ts), tagged tags.suppliers / purchaseOrders /
  // products. The grouping + scorecard math below is unchanged.
  const ctx = await getCurrentOrgContext();
  const data = ctx ? await getSuppliersPageData(ctx.orgId) : null;

  const suppliers = data?.suppliers ?? [];
  const pos = data?.pos ?? null;
  const productCounts = data?.productCounts ?? null;

  // Group POs by supplier, compute per-supplier scorecard.
  type RawPo = {
    id: string;
    supplier_id: string | null;
    status: ScorecardPo["status"];
    expected_date: string | null;
    sent_at: string | null;
    received_at: string | null;
    lines: Array<{
      quantity_expected: number;
      quantity_received: number | null;
      unit_cost: string | null;
      landed_unit_cost: string | null;
    }> | null;
  };
  const posBySupplier = new Map<string, ScorecardPo[]>();
  for (const raw of (pos ?? []) as RawPo[]) {
    if (!raw.supplier_id) continue;
    const sp: ScorecardPo = {
      id: raw.id,
      status: raw.status,
      expected_date: raw.expected_date,
      sent_at: raw.sent_at,
      received_at: raw.received_at,
      lines: (raw.lines ?? []).map((l) => ({
        quantity_expected: l.quantity_expected,
        quantity_received: l.quantity_received,
        unit_cost: l.unit_cost,
        landed_unit_cost: l.landed_unit_cost,
      })),
    };
    const bucket = posBySupplier.get(raw.supplier_id);
    if (bucket) bucket.push(sp);
    else posBySupplier.set(raw.supplier_id, [sp]);
  }

  // Per-supplier preferred-product count.
  const productCountMap = new Map<string, number>();
  for (const row of (productCounts ?? []) as Array<{
    preferred_supplier_id: string | null;
  }>) {
    if (!row.preferred_supplier_id) continue;
    productCountMap.set(
      row.preferred_supplier_id,
      (productCountMap.get(row.preferred_supplier_id) ?? 0) + 1
    );
  }

  // Build the stats map the list component consumes.
  const stats: SupplierStatsMap = {};
  for (const s of suppliers) {
    const supplierPos = posBySupplier.get(s.id) ?? [];
    const card = computeSupplierStats(supplierPos);
    stats[s.id] = {
      poCount: card.totalPos,
      productCount: productCountMap.get(s.id) ?? 0,
      onTimePct: card.onTimePct,
      avgLeadDays: card.avgLeadTimeDays,
    };
  }

  return (
    <>
      <header className="hairline-b pb-16 mb-20 flex items-center gap-14">
        <div className="flex flex-col gap-4 min-w-0">
          <h1
            className="text-text"
            style={{
              fontFamily: "var(--display)",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.2px",
            }}
          >
            Suppliers
          </h1>
          <p
            className="text-text-dim"
            style={{ fontFamily: "var(--mono)", fontSize: 11 }}
          >
            Vendors you place purchase orders with. Tap any supplier for the
            full scorecard.
          </p>
        </div>
        <CornerLink
          href="/suppliers/new"
          variant="primary"
          size="sm"
          className="ml-auto"
        >
          <Plus size={11} strokeWidth={1.5} />
          New supplier
        </CornerLink>
      </header>

      <SupplierList suppliers={suppliers} stats={stats} />
    </>
  );
}