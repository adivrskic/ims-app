import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { Building2, MapPin, Phone, Layers, Package, Edit3 } from "lucide-react";
import { AddWarehouseForm } from "./AddWarehouseForm";
import { archiveWarehouse, restoreWarehouse } from "./actions";

export const metadata = { title: "Facilities" };

interface WarehouseRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  is_active: boolean | null;
  created_at: string | null;
  sections: Array<{
    id: string;
    code: string | null;
    name: string | null;
    color: string | null;
  }> | null;
  locations: Array<{ id: string }> | null;
}

export default async function FacilitiesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("warehouses")
    .select(
      "id, name, address, city, state, zip, phone, is_active, created_at, sections:sections ( id, code, name, color ), locations:locations ( id )"
    )
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <p className="mono-sm text-[var(--danger)]">
        Failed to load facilities: {error.message}
      </p>
    );
  }

  const warehouses = (data ?? []) as WarehouseRow[];
  const active = warehouses.filter((w) => w.is_active !== false);
  const archived = warehouses.filter((w) => w.is_active === false);

  return (
    /*
      Top-level page (no longer inside settings layout). Provides its own
      PageHeader. flex-1 min-h-0 lets short content fill the viewport.
    */
    <div className="flex flex-col gap-32 flex-1 min-h-0">
      <PageHeader
        eyebrow="Workspace"
        title="Facilities"
        description="Warehouses, sections, and team access. Each facility scopes its own inventory, locations, and orders."
        meta={[
          { label: "Active", value: active.length },
          { label: "Archived", value: archived.length },
        ]}
      />

      <section
        aria-labelledby="active-heading"
        className="flex flex-col gap-12"
      >
        <SectionTitle
          eyebrow="Workspace"
          title={`Active · ${active.length}`}
          action={<AddWarehouseForm />}
        />

        {active.length === 0 ? (
          <EmptyState
            title="No facilities yet"
            description="Each facility scopes its own sections, locations, and team access. Add your first to start tracking inventory."
            icon={<Building2 size={20} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="flex flex-col gap-12">
            {active.map((w) => (
              <WarehouseCard key={w.id} warehouse={w} />
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section
          aria-labelledby="archived-heading"
          className="flex flex-col gap-12"
        >
          <SectionTitle
            eyebrow="Archive"
            title={`Archived · ${archived.length}`}
          />
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {archived.map((w) => (
              <li
                key={w.id}
                className="px-20 py-14 flex items-center gap-14 opacity-55"
              >
                <Building2
                  size={14}
                  strokeWidth={1.5}
                  className="text-text-dim shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-text-muted truncate"
                    style={{
                      fontFamily: "var(--display)",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {w.name}
                  </p>
                  <p className="mono-sm text-text-dim">
                    {[w.city, w.state].filter(Boolean).join(", ") || "—"}
                  </p>
                </div>
                <form action={restoreWarehouse}>
                  <input type="hidden" name="id" value={w.id} />
                  <CornerButton type="submit" variant="ghost" size="sm">
                    Restore
                  </CornerButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function WarehouseCard({ warehouse: w }: { warehouse: WarehouseRow }) {
  const sectionCount = (w.sections ?? []).length;
  const locationCount = (w.locations ?? []).length;
  const cityState = [w.city, w.state].filter(Boolean).join(", ");

  return (
    <li className="hairline bg-[var(--surface)] p-20 flex flex-col gap-16">
      <div className="flex items-start justify-between gap-16 flex-wrap">
        <div className="flex items-start gap-14 min-w-0">
          <span
            className="w-36 h-36 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center shrink-0 text-[var(--accent)]"
            aria-hidden
          >
            <Building2 size={14} strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <h3
              className="text-text truncate"
              style={{
                fontFamily: "var(--display)",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              {w.name}
            </h3>
            <div className="flex items-center gap-14 mono-sm text-text-muted mt-4 flex-wrap">
              {(w.address || cityState) && (
                <span className="inline-flex items-center gap-4">
                  <MapPin size={10} strokeWidth={1.5} />
                  <span>
                    {w.address}
                    {w.address && cityState ? ", " : ""}
                    {cityState}
                    {w.zip ? ` ${w.zip}` : ""}
                  </span>
                </span>
              )}
              {w.phone && (
                <span className="inline-flex items-center gap-4">
                  <Phone size={10} strokeWidth={1.5} />
                  <span>{w.phone}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-10">
          <Badge tone="success" variant="filled">
            Active
          </Badge>
          {/* Updated href from /settings/facilities/.../builder → /facilities/.../builder */}
          <CornerLink
            href={`/facilities/${w.id}/builder`}
            variant="ghost"
            size="sm"
          >
            <Edit3 size={11} strokeWidth={1.5} />
            Edit layout
          </CornerLink>
          <form action={archiveWarehouse}>
            <input type="hidden" name="id" value={w.id} />
            <CornerButton type="submit" variant="ghost" size="sm">
              Archive
            </CornerButton>
          </form>
        </div>
      </div>

      <div className="hairline-t pt-14 grid grid-cols-2 md:grid-cols-3 gap-12">
        <StatBlock
          icon={<Layers size={11} strokeWidth={1.5} />}
          label="Sections"
          value={sectionCount}
        />
        <StatBlock
          icon={<Package size={11} strokeWidth={1.5} />}
          label="Locations"
          value={locationCount}
        />
        <StatBlock
          label="Added"
          valueStr={
            w.created_at
              ? new Date(w.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "—"
          }
        />
      </div>
    </li>
  );
}

function StatBlock({
  icon,
  label,
  value,
  valueStr,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: number;
  valueStr?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <span className="label-text inline-flex items-center gap-4">
        {icon}
        {label}
      </span>
      <span className="mono-body text-text tnum">
        {valueStr ?? (value ?? 0).toLocaleString()}
      </span>
    </div>
  );
}
