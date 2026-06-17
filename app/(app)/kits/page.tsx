import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { Blocks, Trash2, Hammer } from "lucide-react";
import { CornerLink } from "@/components/ui/CornerButton";
import { AddKitComponentForm } from "./AddKitComponentForm";
import { BuildKitForm } from "./BuildKitForm";
import { setKitFlag, removeKitComponent } from "./actions";

export const metadata = { title: "Kits" };

export default async function KitsPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) {
    return <PageHeader eyebrow="Operate" title="Kits" description="No workspace." />;
  }
  const supabase = await createClient();
  const orgId = ctx.orgId;

  const [
    { data: productsData },
    { data: componentsData },
    { data: locsData },
    { data: warehousesData },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, barcode, is_kit")
      .eq("org_id", orgId)
      .order("name", { ascending: true }),
    supabase
      .from("kit_components")
      .select("id, kit_product_id, component_product_id, quantity")
      .eq("org_id", orgId),
    // Only count stock the build can actually consume — assemble_kit pulls from
    // is_active && !quarantined locations, so "Buildable now"/"On hand" here must
    // use the same filter or it overstates what a build can do.
    supabase
      .from("locations")
      .select("product_id, quantity")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .eq("quarantined", false),
    supabase
      .from("warehouses")
      .select("id, name")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);
  const warehouses = (warehousesData ?? []) as Array<{ id: string; name: string }>;

  type ProductRow = { id: string; name: string; barcode: string; is_kit: boolean };
  type ComponentRow = {
    id: string;
    kit_product_id: string;
    component_product_id: string;
    quantity: number;
  };
  const products = (productsData ?? []) as ProductRow[];
  const components = (componentsData ?? []) as ComponentRow[];

  const productById = new Map(products.map((p) => [p.id, p]));
  const onHand = new Map<string, number>();
  for (const l of (locsData ?? []) as Array<{
    product_id: string | null;
    quantity: number | null;
  }>) {
    if (!l.product_id) continue;
    onHand.set(l.product_id, (onHand.get(l.product_id) ?? 0) + (l.quantity ?? 0));
  }

  const componentsByKit = new Map<string, ComponentRow[]>();
  for (const c of components) {
    const arr = componentsByKit.get(c.kit_product_id) ?? [];
    arr.push(c);
    componentsByKit.set(c.kit_product_id, arr);
  }

  const kits = products.filter((p) => p.is_kit);
  // Buildable-now per kit = min over components of floor(on-hand / qty-per-kit).
  // A kit with no components is "—" (recipe not defined yet).
  const buildableFor = (kitId: string): number | null => {
    const comps = componentsByKit.get(kitId) ?? [];
    if (comps.length === 0) return null;
    return comps.reduce((min, c) => {
      const have = onHand.get(c.component_product_id) ?? 0;
      const supports = Math.floor(have / c.quantity);
      return Math.min(min, supports);
    }, Infinity);
  };

  const totalBuildable = kits.reduce((s, k) => s + (buildableFor(k.id) ?? 0), 0);

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Operate"
        title="Kits"
        description="Define kits / assemblies as a bill of materials. 'Buildable now' is derived from current component stock."
        meta={[
          { label: "Kits", value: kits.length },
          {
            label: "Buildable now",
            value: totalBuildable.toLocaleString(),
            status: totalBuildable > 0 ? "live" : undefined,
          },
        ]}
        actions={
          <CornerLink href="/work-orders" variant="ghost" size="sm">
            <Hammer size={11} strokeWidth={1.5} />
            Work orders
          </CornerLink>
        }
      />

      {/* Kit BOMs */}
      <section aria-labelledby="kits">
        <SectionTitle numeral="01" eyebrow="Bill of materials" title="Kits" />
        {kits.length === 0 ? (
          <EmptyState
            title="No kits yet"
            description="Turn a product into a kit below, then add its component products and quantities to define the recipe."
            icon={<Blocks size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="flex flex-col gap-16">
            {kits.map((kit) => {
              const comps = componentsByKit.get(kit.id) ?? [];
              const buildable = buildableFor(kit.id);
              return (
                <div key={kit.id} className="hairline bg-[var(--surface)] overflow-hidden">
                  <header className="px-16 py-12 hairline-b flex items-center justify-between gap-12">
                    <div className="min-w-0">
                      <Link
                        href={`/inventory/${kit.id}`}
                        className="text-text hover:text-[var(--accent)] transition-colors"
                        style={{ fontFamily: "var(--display)", fontSize: 14, fontWeight: 600 }}
                      >
                        {kit.name}
                      </Link>
                      <span className="mono-sm text-text-dim ml-8">{kit.barcode}</span>
                    </div>
                    <div className="flex items-center gap-10 flex-wrap justify-end shrink-0">
                      <span
                        className="px-10 py-4 hairline-subtle"
                        style={{ fontFamily: "var(--mono)", fontSize: 10 }}
                      >
                        <span className="text-text-muted">Buildable now · </span>
                        <span
                          className="tnum"
                          style={{
                            color: buildable && buildable > 0 ? "var(--accent)" : "var(--text-dim)",
                          }}
                        >
                          {buildable == null ? "no recipe" : buildable.toLocaleString()}
                        </span>
                      </span>
                      {comps.length > 0 && (
                        <BuildKitForm kitProductId={kit.id} warehouses={warehouses} />
                      )}
                    </div>
                  </header>

                  {comps.length > 0 ? (
                    <table className="w-full" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr className="hairline-b bg-[var(--surface-2)]">
                          <Th>Component</Th>
                          <Th className="text-right">Qty / kit</Th>
                          <Th className="text-right">On hand</Th>
                          <Th className="text-right">Supports</Th>
                          <th aria-hidden style={{ width: 44 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {comps.map((c) => {
                          const p = productById.get(c.component_product_id);
                          const have = onHand.get(c.component_product_id) ?? 0;
                          const supports = Math.floor(have / c.quantity);
                          const limiting = buildable != null && supports === buildable;
                          return (
                            <tr key={c.id} className="hairline-b last:border-b-0">
                              <Td>
                                <Link
                                  href={`/inventory/${c.component_product_id}`}
                                  className="text-text-secondary hover:text-[var(--accent)] transition-colors"
                                  style={{ fontFamily: "var(--display)", fontSize: 13 }}
                                >
                                  {p?.name ?? "Unknown"}
                                </Link>
                              </Td>
                              <Td className="text-right">
                                <span className="mono-sm tnum text-text-secondary">
                                  {c.quantity}
                                </span>
                              </Td>
                              <Td className="text-right">
                                <span className="mono-sm tnum text-text-secondary">
                                  {have.toLocaleString()}
                                </span>
                              </Td>
                              <Td className="text-right">
                                <span
                                  className="mono-sm tnum"
                                  style={{ color: limiting ? "var(--warning)" : "var(--text-secondary)" }}
                                  title={limiting ? "Limiting component" : undefined}
                                >
                                  {supports.toLocaleString()}
                                </span>
                              </Td>
                              <Td className="text-right">
                                <form action={removeKitComponent} style={{ display: "inline" }}>
                                  <input type="hidden" name="id" value={c.id} />
                                  <button
                                    type="submit"
                                    className="hairline-subtle p-6 text-text-muted hover:text-[var(--danger)] hover:border-[var(--danger)] transition-colors"
                                    aria-label="Remove component"
                                    title="Remove component"
                                  >
                                    <Trash2 size={11} strokeWidth={1.5} />
                                  </button>
                                </form>
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="px-16 py-12 mono-sm text-text-dim">
                      No components yet — add the first below.
                    </p>
                  )}

                  <AddKitComponentForm
                    kitProductId={kit.id}
                    products={products.filter((p) => p.id !== kit.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Opt-in: which products are kits */}
      <section aria-labelledby="setup">
        <SectionTitle numeral="02" eyebrow="Setup" title="Kit products" />
        <p className="mono-sm text-text-muted mb-12" style={{ lineHeight: 1.6 }}>
          Mark products that are kits / assemblies. Only these get a bill of
          materials above.
        </p>
        {products.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Add products in Inventory first, then designate kits here."
            icon={<Blocks size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <ul className="divide-y divide-[var(--border-subtle)]">
              {products.map((p) => (
                <li key={p.id} className="flex items-center gap-12 px-16 py-10">
                  <div className="flex-1 min-w-0">
                    <span className="text-text" style={{ fontFamily: "var(--display)", fontSize: 13 }}>
                      {p.name}
                    </span>
                    <span className="mono-sm text-text-dim ml-8">{p.barcode}</span>
                  </div>
                  <form action={setKitFlag}>
                    <input type="hidden" name="product_id" value={p.id} />
                    <input type="hidden" name="enabled" value={(!p.is_kit).toString()} />
                    <button
                      type="submit"
                      aria-pressed={p.is_kit}
                      className={`hairline-subtle px-10 py-5 inline-flex items-center gap-6 transition-colors ${
                        p.is_kit
                          ? "text-[var(--accent)] border-[var(--accent-deep)] bg-[var(--accent-dim)]"
                          : "text-text-muted hover:text-text hover:border-[var(--border-hover)]"
                      }`}
                      style={{ fontFamily: "var(--mono)", fontSize: 10 }}
                      title={p.is_kit ? "Is a kit" : "Not a kit"}
                    >
                      <span className={p.is_kit ? "dot dot-live" : "dot dot-offline"} aria-hidden />
                      {p.is_kit ? "Kit" : "Off"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
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
    <th className={`label-text text-left px-14 py-10 font-normal ${className}`}>
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
  return <td className={`px-14 py-10 ${className}`}>{children}</td>;
}
