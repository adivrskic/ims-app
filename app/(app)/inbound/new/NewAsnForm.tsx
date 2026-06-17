"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/Select";
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

  const field =
    "hairline-subtle bg-[var(--surface-2)] px-8 py-6 text-text w-full";
  const fieldStyle = { fontFamily: "var(--mono)", fontSize: 12 } as const;

  return (
    <form action={onSubmit} className="flex flex-col gap-16">
      {error && (
        <div className="hairline-subtle px-10 py-7 mono-sm" style={{ background: "var(--danger-dim)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
        <div className="flex flex-col gap-4">
          <span className="label-text text-text-muted">Supplier</span>
          <Select
            name="supplier_id"
            defaultValue=""
            ariaLabel="Supplier"
            compact
            options={[
              { value: "", label: "— none —" },
              ...suppliers.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        <div className="flex flex-col gap-4">
          <span className="label-text text-text-muted">Destination facility</span>
          <Select
            name="warehouse_id"
            defaultValue={warehouses[0]?.id ?? ""}
            ariaLabel="Destination facility"
            compact
            options={[
              { value: "", label: "— none —" },
              ...warehouses.map((w) => ({ value: w.id, label: w.name })),
            ]}
          />
        </div>
        <label className="flex flex-col gap-4">
          <span className="label-text text-text-muted">Supplier ref #</span>
          <input name="reference" className={field} style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-4">
          <span className="label-text text-text-muted">Expected date</span>
          <input name="expected_date" type="date" className={field} style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-4">
          <span className="label-text text-text-muted">Carrier</span>
          <input name="carrier" className={field} style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-4">
          <span className="label-text text-text-muted">Tracking #</span>
          <input name="tracking_number" className={field} style={fieldStyle} />
        </label>
      </div>

      <div className="flex flex-col gap-8">
        <span className="label-text text-text-muted">Lines</span>
        {lines.map((l, i) => (
          <div key={i} className="flex items-end gap-8 flex-wrap">
            <div className="flex flex-col gap-2 flex-1 min-w-[160px]">
              <span className="mono-sm text-text-dim">Link product (optional)</span>
              <Select
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
                compact
                placeholder="— unlinked —"
                options={[
                  { value: "", label: "— unlinked —" },
                  ...products.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>
            <label className="flex flex-col gap-2 flex-1 min-w-[160px]">
              <span className="mono-sm text-text-dim">Name / description</span>
              <input value={l.product_name} onChange={(e) => update(i, { product_name: e.target.value })} placeholder="Name or description" className={field} style={fieldStyle} />
            </label>
            <label className="flex flex-col gap-2 w-[72px]">
              <span className="mono-sm text-text-dim">Qty</span>
              <input type="number" min={1} value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} className={field} style={fieldStyle} />
            </label>
            <label className="flex flex-col gap-2 w-[110px]">
              <span className="mono-sm text-text-dim">LPN / pallet</span>
              <input value={l.lpn} onChange={(e) => update(i, { lpn: e.target.value })} className={field} style={fieldStyle} />
            </label>
            <label className="flex flex-col gap-2 w-[100px]">
              <span className="mono-sm text-text-dim">Lot</span>
              <input value={l.lot_number} onChange={(e) => update(i, { lot_number: e.target.value })} className={field} style={fieldStyle} />
            </label>
            <button type="button" onClick={() => removeLine(i)} className="hairline-subtle p-7 hover:border-[var(--danger)] text-text-secondary hover:text-[var(--danger)] transition-colors" aria-label="Remove line">
              <Trash2 size={11} strokeWidth={1.5} />
            </button>
          </div>
        ))}
        <button type="button" onClick={addLine} className="hairline-subtle px-12 py-7 inline-flex items-center gap-6 w-fit hover:border-[var(--accent)] hover:text-[var(--accent)] text-text-secondary transition-colors">
          <Plus size={11} strokeWidth={1.5} />
          <span className="label-text">Add line</span>
        </button>
      </div>

      <label className="flex flex-col gap-4">
        <span className="label-text text-text-muted">Notes</span>
        <textarea name="notes" rows={2} className={field} style={fieldStyle} />
      </label>

      <div>
        <button type="submit" disabled={busy} className="hairline-subtle px-16 py-8 inline-flex items-center gap-8 border-[var(--accent-soft)] bg-[var(--accent-dim)] text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-50 transition-colors">
          {busy ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Plus size={12} strokeWidth={1.5} />}
          <span className="label-text">Create ASN</span>
        </button>
      </div>
    </form>
  );
}
