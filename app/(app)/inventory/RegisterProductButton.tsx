"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { createProduct } from "./actions";

interface Category {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Props {
  categories: Category[];
  suppliers: Supplier[];
}

export function RegisterProductButton({ categories, suppliers }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createProduct, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // On success: close modal + navigate to product detail
  useEffect(() => {
    if (state?.success && state.id) {
      setOpen(false);
      router.push(`/inventory/${state.id}`);
    }
  }, [state, router]);

  // Reset form when closing
  useEffect(() => {
    if (!open && formRef.current) {
      formRef.current.reset();
    }
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <CornerButton
        variant="primary"
        size="sm"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Plus size={12} strokeWidth={1.5} /> Register product
      </CornerButton>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-title"
          className="fixed inset-0 flex items-start justify-center px-16 pt-[8vh] pb-[8vh] overflow-y-auto"
          style={{
            zIndex: 200,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[640px] hairline bg-[var(--surface)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-20 py-14 hairline-b flex items-center justify-between">
              <div>
                <p className="label-text text-text-muted">New product</p>
                <h2
                  id="register-title"
                  className="text-text mt-2"
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  Register product
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-secondary"
                aria-label="Close"
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            </header>

            <form
              ref={formRef}
              action={formAction}
              className="p-20 flex flex-col gap-18"
            >
              <p className="mono-sm text-text-muted">
                Once registered, this SKU can be located in any bay via the
                mobile app or API.
              </p>

              {/* ── Identity ─────────────────────────────────────────── */}
              <fieldset className="flex flex-col gap-12">
                <legend className="label-text text-text-muted mb-2">
                  Identity
                </legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <Input
                    label="Barcode"
                    name="barcode"
                    type="text"
                    required
                    autoComplete="off"
                  />
                  <Input
                    label="Internal SKU"
                    name="internal_sku"
                    type="text"
                    autoComplete="off"
                  />
                </div>
                <Input
                  label="Name"
                  name="name"
                  type="text"
                  required
                  autoComplete="off"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <label className="field-shell block" data-filled="true">
                    <span className="field-label">Category</span>
                    <select
                      name="category_id"
                      defaultValue=""
                      className="field-input cursor-pointer"
                      aria-label="Category"
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Manufacturer"
                    name="manufacturer"
                    type="text"
                    autoComplete="off"
                  />
                </div>
              </fieldset>

              {/* ── Physical ─────────────────────────────────────────── */}
              <fieldset className="flex flex-col gap-12">
                <legend className="label-text text-text-muted mb-2">
                  Physical
                </legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <Input
                    label="Dimensions"
                    name="dimensions"
                    type="text"
                    autoComplete="off"
                  />
                  <Input
                    label="Weight"
                    name="weight"
                    type="text"
                    autoComplete="off"
                  />
                </div>
              </fieldset>

              {/* ── Replenishment + cost (NEW, P1) ───────────────────── */}
              <fieldset className="flex flex-col gap-12">
                <legend className="label-text text-text-muted mb-2">
                  Replenishment &amp; cost
                </legend>
                <p className="mono-sm text-text-dim -mt-4">
                  Powers inventory valuation, smarter reorder math, and the
                  draft-PO flow. All optional, but more here = better signal.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                  <Input
                    label="Unit cost ($)"
                    name="unit_cost"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                  />
                  <Input
                    label="Reorder point"
                    name="reorder_point"
                    type="number"
                    min={0}
                    defaultValue="0"
                  />
                  <Input
                    label="Safety stock"
                    name="safety_stock"
                    type="number"
                    min={0}
                    defaultValue="0"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <Input
                    label="Lead time (days)"
                    name="lead_time_days"
                    type="number"
                    min={0}
                    placeholder="e.g. 14"
                  />
                  <label className="field-shell block" data-filled="true">
                    <span className="field-label">Preferred supplier</span>
                    <select
                      name="preferred_supplier_id"
                      defaultValue=""
                      className="field-input cursor-pointer"
                      aria-label="Preferred supplier"
                    >
                      <option value="">
                        {suppliers.length === 0
                          ? "No suppliers yet"
                          : "— Select —"}
                      </option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {suppliers.length === 0 && (
                  <p className="mono-sm text-text-dim">
                    Add suppliers under Settings → Suppliers to enable this
                    picker.
                  </p>
                )}
              </fieldset>

              <label className="field-shell block">
                <span className="field-label">Notes</span>
                <textarea
                  name="notes"
                  rows={3}
                  className="field-input resize-none"
                  placeholder="Care, installation hints, finish details…"
                />
              </label>

              {state?.error && (
                <p
                  role="alert"
                  className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)]"
                >
                  {state.error}
                </p>
              )}

              <div className="flex items-center justify-end gap-10 hairline-t pt-14 -mx-20 px-20">
                <CornerButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </CornerButton>
                <CornerButton
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={pending}
                >
                  Register →
                </CornerButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
