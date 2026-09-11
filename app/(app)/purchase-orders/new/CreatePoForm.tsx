"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { FormSection } from "@/components/ui/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { FormNotice } from "@/components/ui/FormNotice";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { createPurchaseOrder } from "../actions";

interface Product {
  id: string;
  name: string;
  barcode: string;
}

interface Warehouse {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  payment_terms: string | null;
}

interface Props {
  products: Product[];
  warehouses: Warehouse[];
  suppliers: Supplier[];
}

interface LineItem {
  uid: string;
  product_id: string;
  quantity: number;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function CreatePoForm({ products, warehouses, suppliers }: Props) {
  const [items, setItems] = useState<LineItem[]>([
    { uid: newId(), product_id: "", quantity: 1 },
  ]);
  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id ?? "");
  const [state, formAction, pending] = useActionState(
    createPurchaseOrder,
    undefined
  );

  const itemsJson = useMemo(
    () =>
      JSON.stringify(
        items
          .filter((i) => i.product_id && i.quantity > 0)
          .map(({ product_id, quantity }) => ({ product_id, quantity }))
      ),
    [items]
  );

  const updateItem = (uid: string, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((i) => (i.uid === uid ? { ...i, ...patch } : i))
    );
  };

  const addLine = () => {
    setItems((prev) => [
      ...prev,
      { uid: newId(), product_id: "", quantity: 1 },
    ]);
  };

  const removeLine = (uid: string) => {
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((i) => i.uid !== uid)
    );
  };

  const validLineCount = items.filter(
    (i) => i.product_id && i.quantity > 0
  ).length;

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;

  // No suppliers exist yet — show a guided empty state instead of the form.
  if (suppliers.length === 0) {
    return (
      <div className="hairline bg-[var(--surface)] p-32 flex flex-col items-center text-center gap-14">
        <h2
          className="text-text"
          style={{
            fontFamily: "var(--display)",
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          Add a supplier first
        </h2>
        <p className="mono-sm text-text-muted max-w-[440px]">
          Purchase orders are placed against suppliers. Create your first
          supplier under Settings → Suppliers, then come back here to draft a
          PO.
        </p>
        <CornerLink href="/suppliers" variant="primary" size="sm">
          Go to Suppliers
        </CornerLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-32">
      <input type="hidden" name="items" value={itemsJson} />

      {/* Supplier */}
      <FormSection
        title="Supplier"
        description="Pick from your supplier directory. Contact info auto-populates on the printed PO."
        action={
          <Link
            href="/suppliers"
            className="mono-sm text-text-muted hover:text-[var(--accent)] transition-colors whitespace-nowrap"
          >
            Manage
          </Link>
        }
      >

        <Select
          label="Supplier"
          name="supplier_id"
          value={supplierId}
          onChange={setSupplierId}
          required
          ariaLabel="Supplier"
          options={suppliers.map((s) => ({
            value: s.id,
            label: s.name,
            hint: s.payment_terms ?? undefined,
          }))}
        />

        {selectedSupplier && (
          <div className="hairline-subtle bg-[var(--surface-2)] px-14 py-10 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <p className="label-text text-text-muted">Email</p>
              <p className="mono-sm text-text-secondary">
                {selectedSupplier.email ?? "—"}
              </p>
            </div>
            <div>
              <p className="label-text text-text-muted">Phone</p>
              <p className="mono-sm text-text-secondary">
                {selectedSupplier.phone ?? "—"}
              </p>
            </div>
          </div>
        )}
      </FormSection>

      {/* Destination + schedule */}
      <FormSection title="Destination + schedule" description="Which facility the shipment lands at and the target receiving date.">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <Select
            label="Facility"
            name="warehouse_id"
            defaultValue={warehouses[0]?.id ?? ""}
            required
            ariaLabel="Facility"
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          />
          <Input label="Expected delivery" name="expected_date" type="date" />
        </div>
      </FormSection>

      {/* Line items */}
      <FormSection
        title="Line items"
        description={`${validLineCount} ${validLineCount === 1 ? "item" : "items"} ready`}
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
        {/* Column captions once, instead of a label on every row. */}
        <div className="-mx-20 px-20 pb-8 hairline-b flex items-center gap-12">
          <span className="w-16 shrink-0" aria-hidden />
          <span className="label-text flex-1">Product</span>
          <span className="label-text w-[104px] shrink-0">Qty</span>
          <span className="w-[27px] shrink-0" aria-hidden />
        </div>
        <ul className="-mx-20 -mb-20 divide-y divide-[var(--border-subtle)]">
          {items.map((item, idx) => (
            <li key={item.uid} className="px-20 py-12 flex items-center gap-12">
              <span
                className="mono-sm text-text-dim shrink-0 w-16 tnum"
                aria-hidden
              >
                {String(idx + 1).padStart(2, "0")}
              </span>

              <Select
                className="flex-1 min-w-0"
                value={item.product_id}
                onChange={(v) => updateItem(item.uid, { product_id: v })}
                ariaLabel={`Product for line ${idx + 1}`}
                placeholder="— Select —"
                options={products.map((p) => ({
                  value: p.id,
                  label: p.name,
                  hint: p.barcode,
                }))}
              />

              <Input
                className="w-[104px] shrink-0"
                type="number"
                min={1}
                inputMode="numeric"
                value={item.quantity}
                onChange={(e) =>
                  updateItem(item.uid, {
                    quantity: Math.max(0, parseInt(e.target.value, 10) || 0),
                  })
                }
                aria-label={`Quantity for line ${idx + 1}`}
              />

              <button
                type="button"
                onClick={() => removeLine(item.uid)}
                disabled={items.length === 1}
                className="hairline-subtle p-7 hover:border-[var(--danger)] hover:text-[var(--danger)] text-text-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                aria-label={`Remove line ${idx + 1}`}
              >
                <Trash2 size={11} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      </FormSection>

      <section className="hairline bg-[var(--surface)] p-20">
        <Textarea
          label="Notes"
          labelNote="optional"
          name="notes"
          rows={3}
          placeholder="Delivery instructions, ship-to contact, payment terms overrides…"
        />
      </section>

      {state?.error && (
        <FormNotice>{state.error}</FormNotice>
      )}

      <FormActions>
        <CornerLink href="/purchase-orders" variant="ghost" size="sm">
          Cancel
        </CornerLink>
        <CornerButton
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
        >
          Create draft PO →
        </CornerButton>
      </FormActions>
    </form>
  );
}
