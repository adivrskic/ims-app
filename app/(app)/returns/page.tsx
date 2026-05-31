import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RotateCcw } from "lucide-react";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getReturnsList } from "@/lib/data/returns";
import { ReturnsRealtime } from "@/components/realtime/PageRealtime";

export const metadata = { title: "Returns" };

type Disposition =
  | "restock"
  | "damaged"
  | "hold_for_inspection"
  | "supplier_return";

interface ReturnRow {
  id: string;
  quantity: number;
  disposition: Disposition;
  reason: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  product:
    | { id: string; name: string; barcode: string }
    | { id: string; name: string; barcode: string }[]
    | null;
  received_by_profile:
    | { full_name: string | null; email: string }
    | { full_name: string | null; email: string }[]
    | null;
}

const DISPOSITION_CONFIG: Record<
  Disposition,
  {
    label: string;
    tone: "success" | "danger" | "warning" | "info";
    description: string;
  }
> = {
  restock: {
    label: "Restock",
    tone: "success",
    description: "Returned to active inventory.",
  },
  damaged: {
    label: "Damaged",
    tone: "danger",
    description: "Written off — not resalable.",
  },
  hold_for_inspection: {
    label: "Hold",
    tone: "warning",
    description: "Quarantined pending QA review.",
  },
  supplier_return: {
    label: "Supplier return",
    tone: "info",
    description: "RMA back to supplier.",
  },
};

const FILTERS: Array<{
  key: string;
  label: string;
  disposition: Disposition | null;
}> = [
  { key: "all", label: "All", disposition: null },
  { key: "restock", label: "Restock", disposition: "restock" },
  { key: "damaged", label: "Damaged", disposition: "damaged" },
  { key: "hold", label: "Hold", disposition: "hold_for_inspection" },
  { key: "supplier", label: "Supplier", disposition: "supplier_return" },
];

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ disposition?: string }>;
}) {
  const { disposition: rawDisp } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === rawDisp) ?? FILTERS[0];

  // Resolve scope once, then read listing + disposition counts from the
  // cross-request cache (lib/data/returns.ts), keyed by org + facility +
  // disposition and tagged tags.returns(orgId). ReturnsRealtime (mounted
  // below) keeps the cache live, since returns are created externally.
  const scope = await getActiveScope();
  const ctx = await getCurrentOrgContext();
  const facilityId = scope.mode === "single" ? scope.id : null;

  const data = ctx
    ? await getReturnsList(ctx.orgId, facilityId, activeFilter.disposition)
    : null;

  const rows = (data?.rows ?? []) as ReturnRow[];
  const total = data?.total ?? 0;
  const pendingReview = data?.pendingReview ?? 0;
  // Rebuild the Map the chip rendering expects. The fetcher returns a plain
  // object because unstable_cache serializes its result to JSON.
  const countMap = new Map<Disposition, number>(
    Object.entries(data?.counts ?? {}) as [Disposition, number][]
  );

  return (
    <div className="flex flex-col gap-32">
      <ReturnsRealtime
        warehouseId={scope.mode === "single" ? scope.id : null}
      />
      <PageHeader
        eyebrow="Flow"
        title="Returns"
        description={scopeDescription(scope, {
          all: "Inbound items from cancelled orders, install over-pulls, and damaged shipments. Each return is dispositioned for restock, write-off, or supplier RMA.",
          single: (name) =>
            `Returns received at ${name} — restock, write-off, or supplier RMA.`,
        })}
        meta={[
          { label: "Total", value: total },
          {
            label: "Pending review",
            value: pendingReview,
            status: pendingReview > 0 ? "live" : undefined,
          },
        ]}
      />

      <nav
        className="flex items-center gap-2 hairline-b overflow-x-auto"
        aria-label="Filter by disposition"
      >
        {FILTERS.map((f) => {
          const isActive = f.key === activeFilter.key;
          const chipCount = f.disposition
            ? countMap.get(f.disposition) ?? 0
            : total;
          return (
            <Link
              key={f.key}
              href={
                f.key === "all" ? "/returns" : `/returns?disposition=${f.key}`
              }
              className={`relative px-12 py-10 transition-colors whitespace-nowrap flex items-center gap-8 ${
                isActive
                  ? "text-[var(--accent)]"
                  : "text-text-muted hover:text-text"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="label-text">{f.label}</span>
              <span
                className={`tnum ${
                  isActive ? "text-[var(--accent)]" : "text-text-dim"
                }`}
                style={{ fontFamily: "var(--mono)", fontSize: 10 }}
              >
                {chipCount}
              </span>
              {isActive && (
                <span
                  className="absolute left-0 right-0 bottom-0 h-px bg-[var(--accent)]"
                  aria-hidden
                  style={{ bottom: -1 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title={
            activeFilter.key === "all"
              ? scope.mode === "single"
                ? `No returns at ${scope.name}`
                : "No returns yet"
              : `No ${activeFilter.label.toLowerCase()} returns`
          }
          description="Returns are logged from the mobile app at the receiving dock. Each gets a disposition and routes automatically — restock items land back in their last-known section, damaged items are written off, and RMA items queue for supplier pickup."
          icon={<RotateCcw size={20} strokeWidth={1.5} />}
        />
      ) : (
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {rows.map((r) => {
            const product = Array.isArray(r.product) ? r.product[0] : r.product;
            const receiver = Array.isArray(r.received_by_profile)
              ? r.received_by_profile[0]
              : r.received_by_profile;
            const cfg = DISPOSITION_CONFIG[r.disposition];
            const reviewed = !!r.reviewed_at;
            return (
              <li key={r.id} className="px-20 py-14 row-interactive">
                <div className="flex items-start gap-14">
                  <div className="flex flex-col items-center gap-4 shrink-0 w-[60px]">
                    <span
                      className="mono-body tnum text-[var(--warning)]"
                      style={{ fontSize: 18, fontWeight: 500 }}
                    >
                      {r.quantity}
                    </span>
                    <span className="label-text text-text-dim">units</span>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-4">
                    <div className="flex items-center gap-10 flex-wrap">
                      {product ? (
                        <span
                          className="text-text truncate"
                          style={{
                            fontFamily: "var(--display)",
                            fontSize: 14,
                            fontWeight: 500,
                          }}
                        >
                          {product.name}
                        </span>
                      ) : (
                        <span className="text-text-dim mono-sm">
                          [unknown product]
                        </span>
                      )}
                      <Badge tone={cfg.tone} variant="filled">
                        {cfg.label}
                      </Badge>
                      {!reviewed && (
                        <Badge tone="warning" variant="outline">
                          Pending review
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-14 flex-wrap mono-sm text-text-muted">
                      {product && <span>{product.barcode}</span>}
                      <span className="text-text-dim">{cfg.description}</span>
                      {receiver && (
                        <span>
                          received by{" "}
                          {receiver.full_name || receiver.email.split("@")[0]}
                        </span>
                      )}
                      <span className="text-text-dim">
                        {relTime(r.created_at)}
                      </span>
                    </div>
                    {r.reason && (
                      <p className="mono-sm text-text-secondary mt-2">
                        {r.reason}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}