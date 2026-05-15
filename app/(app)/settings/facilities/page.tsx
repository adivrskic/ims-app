import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerButton } from "@/components/ui/CornerButton";
import { Building2, MapPin, Phone, Layers, Package } from "lucide-react";
import { AddWarehouseForm } from "./AddWarehouseForm";
import { AddSectionForm } from "./AddSectionForm";
import { archiveWarehouse, restoreWarehouse } from "./actions";

export const metadata = { title: "Facilities · Settings" };

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
    <div className="flex flex-col gap-40">
      <section aria-labelledby="active-heading">
        <SectionTitle
          eyebrow="Workspace"
          title="Facilities"
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
        <section aria-labelledby="archived-heading">
          <SectionTitle eyebrow="Archive" title="Archived" />
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
          <CornerLink
            href={`/settings/facilities/${w.id}/builder`}
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
            w.created_at ? new Date(w.created_at).toLocaleDateString() : "—"
          }
        />
      </div>

      <div className="hairline-t pt-14 flex flex-col gap-10">
        <div className="flex items-center justify-between">
          <p className="label-text text-text-muted">
            Sections {sectionCount > 0 ? `· ${sectionCount}` : ""}
          </p>
          <AddSectionForm warehouseId={w.id} />
        </div>
        {sectionCount > 0 && (
          <ul className="flex flex-wrap gap-6">
            {(w.sections ?? []).map((s) => (
              <li
                key={s.id}
                className="hairline-subtle px-10 py-5 inline-flex items-center gap-8"
              >
                <span
                  className="w-8 h-8 shrink-0"
                  style={{ background: s.color ?? "var(--text-muted)" }}
                  aria-hidden
                />
                <span
                  className="text-text"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {s.code?.trim()}
                </span>
                <span className="label-text text-text-muted">{s.name}</span>
              </li>
            ))}
          </ul>
        )}
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
    <div>
      <div className="flex items-center gap-6 text-text-muted mb-4">
        {icon}
        <span className="label-text">{label}</span>
      </div>
      <p
        className="text-text tnum"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 16,
          fontWeight: 500,
          letterSpacing: "-0.3px",
        }}
      >
        {value !== undefined ? value.toLocaleString() : valueStr}
      </p>
    </div>
  );
}
