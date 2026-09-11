"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { FormSection } from "@/components/ui/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { FormNotice } from "@/components/ui/FormNotice";
import { createAsn } from "../actions";

interface Opt {
  id: string;
  name: string;
}
interface Line {
  product_id: string;
  product_name: string;
  quantity: string;
  lpn: string;
  lot_number: string;
}

const blankLine = (): Line => ({
  product_id: "",
  product_name: "",
  quantity: "1",
  lpn: "",
  lot_number: "",
});

export function NewAsnForm({
  suppliers,
  warehouses,
  products,
}: {
  suppliers: Opt[];
  warehouses: Opt[];
  products: Opt[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((p) => [...p, blankLine()]);
  const removeLine = (i: number) =>
    setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  async function onSubmit(formData: FormData) {
    setError(null);
    const items = lines
      .map((l) => ({
        product_id: l.product_id || null,
        product_name: l.product_name.trim() || null,
        quantity: parseInt(l.quantity, 10) || 0,
        lpn: l.lpn.trim() || null,
        lot_number: l.lot_number.trim() || null,
      }))
      .filter((l) => (l.product_name || l.product_id) && l.quantity > 0);
    if (items.length === 0) {
      setError("Add at least one line with a product (or name) and quantity");
      return;
    }
    formData.set("items", JSON.stringify(items));
    setBusy(true);
    const r = await createAsn(null, formData);
    setBusy(false);
    // createAsn redirects on success; a return value means an error.
    if (r?.error) setError(r.error);
    else router.refresh();
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-24">
      <FormSection
        title="Shipment"
        description="Supplier, destination and carrier details for this inbound shipment."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
          <Select
            label="Supplier"
            name="supplier_id"
            defaultValue=""
            ariaLabel="Supplier"
            options={[
              { value: "", label: "— none —" },
              ...suppliers.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <Select
            label="Destination facility"
            name="warehouse_id"
            defaultValue={warehouses[0]?.id ?? ""}
            ariaLabel="Destination facility"
            options={[
              { value: "", label: "— none —" },
              ...warehouses.map((w) => ({ value: w.id, label: w.name })),
            ]}
          />
          <Input label="Supplier ref #" name="reference" />
          <Input label="Expected date" name="expected_date" type="date" />
          <Input label="Carrier" name="carrier" />
          <Input label="Tracking #" name="tracking_number" />
        </div>
      </FormSection>

      <FormSection
        title="Lines"
        action={
          <CornerButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={addLine}
          >
            <Plus size={11} strokeWidth={1.5} />
            Add line
          </CornerButton>
        }
      >
        <ul className="flex flex-col gap-12">
          {lines.map((l, i) => (
            <li key={i} className="flex items-end gap-8 flex-wrap">
              <Select
                className="flex-1 min-w-[160px]"
                label="Link product (optional)"
                name={`__line_product_${i}`}
                value={l.product_id}
                onChange={(v) => {
                  const picked = products.find((p) => p.id === v);
                  // Link the product and, if the line has no description yet,
                  // seed it with the product name so the line reconciles.
                  update(i, {
                    product_id: v,
                    product_name:
                      l.product_name.trim() || (picked?.name ?? l.product_name),
                  });
                }}
                ariaLabel={`Link product for line ${i + 1}`}
                placeholder="— unlinked —"
                options={[
                  { value: "", label: "— unlinked —" },
                  ...products.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
              <Input
                className="flex-1 min-w-[160px]"
                label="Name / description"
                value={l.product_name}
                onChange={(e) => update(i, { product_name: e.target.value })}
                placeholder="Name or description"
              />
              <Input
                className="w-[104px] shrink-0"
                label="Qty"
                type="number"
                min={1}
                inputMode="numeric"
                value={l.quantity}
                onChange={(e) => update(i, { quantity: e.target.value })}
              />
              <Input
                className="w-[120px] shrink-0"
                label="LPN / pallet"
                value={l.lpn}
                onChange={(e) => update(i, { lpn: e.target.value })}
              />
              <Input
                className="w-[110px] shrink-0"
                label="Lot"
                value={l.lot_number}
                onChange={(e) => update(i, { lot_number: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeLine(i)}
                className="hairline-subtle p-7 mb-6 hover:border-[var(--danger)] text-text-secondary hover:text-[var(--danger)] transition-colors shrink-0"
                aria-label="Remove line"
              >
                <Trash2 size={11} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      </FormSection>

      <section className="hairline bg-[var(--surface)] p-20">
        <Textarea label="Notes" name="notes" rows={2} />
      </section>

      {error && <FormNotice>{error}</FormNotice>}

      <FormActions>
        <CornerButton type="submit" variant="primary" size="sm" loading={busy}>
          <Plus size={11} strokeWidth={1.5} />
          Create ASN
        </CornerButton>
      </FormActions>
    </form>
  );
}
