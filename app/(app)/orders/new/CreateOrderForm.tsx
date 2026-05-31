"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { createOrder } from "../actions";

interface ProductOption {
  id: string;
  name: string;
  barcode: string;
}

interface WarehouseOption {
  id: string;
  name: string;
}

interface Props {
  products: ProductOption[];
  warehouses: WarehouseOption[];
  /** Preselect the order type (e.g. from /orders/new?type=internal_transfer). */
  initialType?: string;
}

interface LineItem {
  uid: string;
  product_id: string;
  quantity: number;
}

const ORDER_TYPES = [
  { value: "installer_job", label: "Installer job" },
  { value: "customer_pickup", label: "Customer pickup" },
  { value: "internal_transfer", label: "Internal transfer" },
  { value: "restock", label: "Restock" },
] as const;

// Order types that represent a customer-facing fulfillment (name required by
// the createOrder action). Transfers/restocks are internal — no customer.
const CUSTOMER_TYPES = new Set(["installer_job", "customer_pickup"]);

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function CreateOrderForm({ products, warehouses, initialType }: Props) {
  const [orderType, setOrderType] = useState<string>(
    ORDER_TYPES.some((t) => t.value === initialType)
      ? (initialType as string)
      : "installer_job"
  );
  const [items, setItems] = useState<LineItem[]>([
    { uid: newId(), product_id: "", quantity: 1 },
  ]);
  const [state, formAction, pending] = useActionState(createOrder, undefined);

  const showCustomer = CUSTOMER_TYPES.has(orderType);
  const isTransfer = orderType === "internal_transfer";

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
    setItems((prev) => prev.map((i) => (i.uid === uid ? { ...i, ...patch } : i)));
  };
  const addLine = () =>
    setItems((prev) => [...prev, { uid: newId(), product_id: "", quantity: 1 }]);
  const removeLine = (uid: string) =>
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((i) => i.uid !== uid)
    );

  const validLineCount = items.filter(
    (i) => i.product_id && i.quantity > 0
  ).length;

  // No products yet — guide the user to the catalog instead of a dead form.
  if (products.length === 0) {
    return (
      <div className="hairline bg-[var(--surface)] p-32 flex flex-col items-center text-center gap-14">
        <h2
          className="text-text"
          style={{ fontFamily: "var(--display)", fontSize: 18, fontWeight: 600 }}
        >
          Add a product first
        </h2>
        <p className="mono-sm text-text-muted max-w-[440px]">
          Orders are built from your product catalog. Register your first
          product, then come back to create an order.
        </p>
        <CornerLink href="/inventory" variant="primary" size="sm">
          Go to Inventory
        </CornerLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-32">
      <input type="hidden" name="items" value={itemsJson} />

      {/* Type + facility */}
      <section className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14">
        <header>
          <h2
            className="text-text"
            style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600 }}
          >
            Order type + facility
          </h2>
          <p className="mono-sm text-text-muted mt-4">
            What kind of order this is and which facility fulfills it.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <label className="field-shell block" data-filled="true">
            <span className="field-label">Order type</span>
            <select
              name="order_type"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
              required
              className="field-input cursor-pointer"
              aria-label="Order type"
            >
              {ORDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-shell block" data-filled="true">
            <span className="field-label">
              {isTransfer ? "Source facility" : "Facility"}
            </span>
            <select
              name="warehouse_id"
              defaultValue={warehouses[0]?.id ?? ""}
              required
              className="field-input cursor-pointer"
              aria-label={isTransfer ? "Source facility" : "Facility"}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>

          {isTransfer && (
            <label className="field-shell block" data-filled="true">
              <span className="field-label">Destination facility</span>
              <select
                name="destination_warehouse_id"
                defaultValue=""
                required
                className="field-input cursor-pointer"
                aria-label="Destination facility"
              >
                <option value="" disabled>
                  — Select —
                </option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {/* Customer — only for customer-facing order types */}
      {showCustomer && (
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
              Customer
            </h2>
            <p className="mono-sm text-text-muted mt-4">
              Who this order is for. Name is required for installer jobs and
              pickups.
            </p>
          </header>

          <Input
            label="Customer name"
            name="customer_name"
            required={showCustomer}
            placeholder="Jane Doe / Acme Flooring Co."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <Input
              label="Phone (optional)"
              name="customer_phone"
              type="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
            />
            <Input
              label="Address (optional)"
              name="customer_address"
              placeholder="123 Main St, Springfield"
            />
          </div>
        </section>
      )}

      {/* Schedule */}
      <section className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14">
        <header>
          <h2
            className="text-text"
            style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600 }}
          >
            Schedule
          </h2>
          <p className="mono-sm text-text-muted mt-4">
            Target delivery / pickup date and an optional time window.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <Input label="Delivery date" name="delivery_date" type="date" />
          <Input
            label="Delivery window (optional)"
            name="delivery_window"
            placeholder="e.g. 8am–12pm"
          />
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
          <CornerButton type="button" variant="ghost" size="sm" onClick={addLine}>
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
          <span className="field-label">Notes (optional)</span>
          <textarea
            name="notes"
            rows={3}
            className="field-input resize-none"
            placeholder="Install instructions, gate codes, special handling…"
          />
        </label>
      </section>

      {state?.error && (
        <p
          role="alert"
          className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-16 py-12 mono-sm text-[var(--danger)]"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-10">
        <CornerLink href="/orders" variant="ghost" size="sm">
          Cancel
        </CornerLink>
        <CornerButton type="submit" variant="primary" size="sm" loading={pending}>
          Create order →
        </CornerButton>
      </div>
    </form>
  );
}
