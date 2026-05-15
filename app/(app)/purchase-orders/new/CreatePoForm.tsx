"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
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

interface Props {
  products: Product[];
  warehouses: Warehouse[];
}

interface LineItem {
  uid: string;
  product_id: string;
  quantity: number;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function CreatePoForm({ products, warehouses }: Props) {
  const [items, setItems] = useState<LineItem[]>([
    { uid: newId(), product_id: "", quantity: 1 },
  ]);
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

  return (
    <form action={formAction} className="flex flex-col gap-32">
      <input type="hidden" name="items" value={itemsJson} />

      {/* Supplier */}
      <section className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14">
        <header>
          <h2
            className="text-text"
            style={{
              fontFamily: "var(--display)",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Supplier
          </h2>
          <p className="mono-sm text-text-muted mt-4">
            Where this order is being placed. Contact details appear on the
            printed PO.
          </p>
        </header>

        <Input
          label="Supplier name"
          name="supplier_name"
          type="text"
          required
          placeholder="e.g. Mohawk Flooring Wholesale"
        />
        <Input
          label="Contact (email · phone)"
          name="supplier_contact"
          type="text"
          placeholder="orders@supplier.com · (555) 000-0000"
        />
      </section>

      {/* Destination + schedule */}
      <section className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14">
        <header>
          <h2
            className="text-text"
            style={{
              fontFamily: "var(--display)",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Destination + schedule
          </h2>
          <p className="mono-sm text-text-muted mt-4">
            Which facility the shipment lands at and the target receiving date.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <label className="field-shell block" data-filled="true">
            <span className="field-label">Facility</span>
            <select
              name="warehouse_id"
              defaultValue={warehouses[0]?.id ?? ""}
              required
              className="field-input cursor-pointer"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <Input label="Expected delivery" name="expected_date" type="date" />
        </div>
      </section>

      {/* Line items */}
      <section className="hairline bg-[var(--surface)] flex flex-col">
        <header className="px-20 py-14 hairline-b flex items-center justify-between">
          <div>
            <h2
              className="text-text"
              style={{
                fontFamily: "var(--display)",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              Line items
            </h2>
            <p className="mono-sm text-text-muted mt-4">
              {validLineCount} {validLineCount === 1 ? "item" : "items"} ready
            </p>
          </div>
          <CornerButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={addLine}
          >
            <Plus size={11} strokeWidth={1.5} />
            Add line
          </CornerButton>
        </header>

        <ul className="divide-y divide-[var(--border-subtle)]">
          {items.map((item, idx) => (
            <li key={item.uid} className="px-20 py-12 flex items-center gap-12">
              <span
                className="mono-sm text-text-dim shrink-0 w-16 tnum"
                aria-hidden
              >
                {String(idx + 1).padStart(2, "0")}
              </span>

              <label
                className="field-shell flex-1 block min-w-0"
                data-filled={item.product_id ? "true" : "false"}
              >
                <span className="field-label">Product</span>
                <select
                  value={item.product_id}
                  onChange={(e) =>
                    updateItem(item.uid, { product_id: e.target.value })
                  }
                  className="field-input cursor-pointer"
                  aria-label={`Product for line ${idx + 1}`}
                >
                  <option value="">— Select —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.barcode}
                    </option>
                  ))}
                </select>
              </label>

              <label
                className="field-shell shrink-0 block w-[120px]"
                data-filled="true"
              >
                <span className="field-label">Qty</span>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(item.uid, {
                      quantity: Math.max(0, parseInt(e.target.value, 10) || 0),
                    })
                  }
                  className="field-input tnum"
                  aria-label={`Quantity for line ${idx + 1}`}
                />
              </label>

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
      </section>

      {/* Notes */}
      <section className="hairline bg-[var(--surface)] p-20">
        <label className="field-shell block">
          <span className="field-label">Internal notes</span>
          <textarea
            name="notes"
            rows={3}
            className="field-input resize-none"
            placeholder="Delivery instructions, terms, payment notes…"
          />
        </label>
      </section>

      {state?.error && (
        <p
          role="alert"
          className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)]"
        >
          {state.error}
        </p>
      )}

      <footer className="flex items-center justify-end gap-10">
        <CornerLink href="/purchase-orders" variant="ghost" size="sm">
          Cancel
        </CornerLink>
        <CornerButton
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          disabled={validLineCount === 0}
        >
          Create PO →
        </CornerButton>
      </footer>
    </form>
  );
}
