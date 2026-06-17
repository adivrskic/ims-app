import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getWaveDetail, type WaveStatus } from "@/lib/data/picking";
import {
  setWaveStatus,
  claimWave,
  removeOrderFromWave,
} from "../actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { MapPin, X, Waypoints } from "lucide-react";

export const metadata = { title: "Wave" };

const WAVE_TONE: Record<WaveStatus, "neutral" | "accent" | "success" | "warning"> = {
  planned: "neutral",
  released: "accent",
  complete: "success",
  cancelled: "warning",
};

export default async function WaveDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const ctx = await getCurrentOrgContext();
  if (!ctx) notFound();
  const supabase = await createClient();
  const wave = await getWaveDetail(supabase, ctx.orgId, id);
  if (!wave) notFound();

  const mineLabel =
    wave.assignedTo === ctx.user.id
      ? "Assigned to you"
      : wave.assignedTo
      ? "Assigned"
      : "Unassigned";
  const isTerminal = wave.status === "complete" || wave.status === "cancelled";

  return (
    <div className="flex flex-col gap-32">
      {actionError && (
        <div className="hairline border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-16 py-12 flex items-start gap-12">
          <X
            size={14}
            strokeWidth={1.5}
            className="text-[var(--danger)] shrink-0 mt-2"
          />
          <p className="mono-sm text-[var(--danger)]">{actionError}</p>
        </div>
      )}
      <PageHeader
        backHref="/picking"
        backLabel="All waves"
        eyebrow="Pick wave"
        title={wave.code}
        description={`${wave.orders.length} order${
          wave.orders.length === 1 ? "" : "s"
        } · ${wave.totalUnits} unit${wave.totalUnits === 1 ? "" : "s"} to pick · ${
          wave.zones.length
        } zone${wave.zones.length === 1 ? "" : "s"}`}
        meta={[{ label: "Picker", value: mineLabel }]}
        actions={
          <div className="flex items-center gap-10 flex-wrap">
            <Badge tone={WAVE_TONE[wave.status]} variant="filled">
              {wave.status}
            </Badge>
            {!isTerminal && (
              <form action={claimWave}>
                <input type="hidden" name="wave_id" value={wave.id} />
                {wave.assignedTo === ctx.user.id && (
                  <input type="hidden" name="release" value="1" />
                )}
                <CornerButton type="submit" variant="ghost" size="sm">
                  {wave.assignedTo === ctx.user.id ? "Release" : "Claim"}
                </CornerButton>
              </form>
            )}
            {wave.status === "planned" && (
              <StatusForm waveId={wave.id} status="released" label="Release" variant="primary" />
            )}
            {wave.status === "released" && (
              <StatusForm waveId={wave.id} status="complete" label="Mark complete" variant="primary" />
            )}
            {!isTerminal && (
              <StatusForm waveId={wave.id} status="cancelled" label="Cancel" variant="danger" />
            )}
          </div>
        }
      />

      {/* Orders in the wave */}
      <section aria-labelledby="orders">
        <SectionTitle numeral="01" eyebrow="Batch" title="Orders" />
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {wave.orders.map((o) => (
            <li key={o.id} className="px-20 py-12 flex items-center gap-14">
              <Link
                href={`/orders/${o.id}`}
                className="mono-body text-text hover:text-[var(--accent)] transition-colors"
                style={{ fontSize: 13 }}
              >
                {o.orderNumber ?? o.id.slice(0, 8)}
              </Link>
              <span className="text-text-secondary mono-sm">
                {o.customerName ?? "—"}
              </span>
              <span className="mono-sm text-text-dim ml-auto">{o.status}</span>
              {!isTerminal && (
                <form action={removeOrderFromWave}>
                  <input type="hidden" name="wave_id" value={wave.id} />
                  <input type="hidden" name="order_id" value={o.id} />
                  <button
                    type="submit"
                    className="hairline-subtle p-6 hover:border-[var(--danger)] text-text-muted hover:text-[var(--danger)] transition-colors"
                    aria-label="Remove from wave"
                    title="Remove from wave"
                  >
                    <X size={11} strokeWidth={1.5} />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Zoned pick list */}
      <section aria-labelledby="picklist">
        <SectionTitle
          numeral="02"
          eyebrow="Walk order"
          title="Pick list"
          action={
            <span className="label-text text-text-muted">
              {wave.totalTasks} task{wave.totalTasks === 1 ? "" : "s"} · zones nearest dock first
            </span>
          }
        />
        {wave.zones.length === 0 ? (
          <EmptyState
            title="Nothing to pick"
            description="Lines in this wave are already picked, or their stock isn't placed in a location yet."
            icon={<Waypoints size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="flex flex-col gap-16">
            {wave.zones.map((z) => (
              <div key={z.zone} className="hairline bg-[var(--surface)] overflow-hidden">
                <div className="px-16 py-10 hairline-b bg-[var(--surface-2)] flex items-center gap-10">
                  <MapPin size={12} strokeWidth={1.5} className="text-[var(--accent)]" />
                  <span
                    className="text-text"
                    style={{ fontFamily: "var(--display)", fontSize: 13, fontWeight: 600 }}
                  >
                    Zone {z.zone}
                  </span>
                  <span className="mono-sm text-text-muted ml-auto">
                    {z.tasks.length} task{z.tasks.length === 1 ? "" : "s"} · {z.units} units
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr className="hairline-b">
                        <Th>Slot</Th>
                        <Th>Product</Th>
                        <Th>Order</Th>
                        <Th className="text-right">Pick qty</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {z.tasks.map((t) => (
                        <tr key={t.orderItemId} className="hairline-b last:border-b-0">
                          <Td>
                            <span
                              className={`mono-body tnum ${
                                t.sectionCode ? "text-text" : "text-[var(--warning)]"
                              }`}
                              style={{ fontSize: 13 }}
                            >
                              {t.slotLabel}
                            </span>
                          </Td>
                          <Td>
                            <Link
                              href={`/inventory/${t.productId}`}
                              className="text-text hover:text-[var(--accent)] transition-colors"
                              style={{ fontFamily: "var(--display)", fontSize: 13 }}
                            >
                              {t.productName}
                            </Link>
                            {t.sku && (
                              <span className="mono-sm text-text-dim ml-8">{t.sku}</span>
                            )}
                          </Td>
                          <Td>
                            <Link
                              href={`/orders/${t.orderId}`}
                              className="mono-sm text-text-secondary hover:text-[var(--accent)] transition-colors"
                            >
                              {t.orderNumber ?? t.orderId.slice(0, 8)}
                            </Link>
                          </Td>
                          <Td className="text-right">
                            <span className="mono-body tnum text-text">{t.quantity}</span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {wave.unlocatedTasks > 0 && (
              <p className="mono-sm text-[var(--warning)]">
                {wave.unlocatedTasks} task{wave.unlocatedTasks === 1 ? "" : "s"} have no
                placed stock — locate them before picking.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusForm({
  waveId,
  status,
  label,
  variant,
}: {
  waveId: string;
  status: WaveStatus;
  label: string;
  variant: "primary" | "ghost" | "danger";
}) {
  return (
    <form action={setWaveStatus}>
      <input type="hidden" name="wave_id" value={waveId} />
      <input type="hidden" name="status" value={status} />
      <CornerButton type="submit" variant={variant} size="sm">
        {label}
      </CornerButton>
    </form>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`label-text text-left px-14 py-12 font-normal ${className}`}>
      {children}
    </th>
  );
}
function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-14 py-12 ${className}`}>{children}</td>;
}
