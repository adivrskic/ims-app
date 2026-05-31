"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CornerButton } from "@/components/ui/CornerButton";
import { recordCycleCount } from "./actions";

interface ProductOption {
  id: string;
  name: string;
  barcode: string;
}

interface LocationOption {
  id: string;
  product_id: string;
  bay: number | null;
  level: number | null;
  quantity: number | null;
  section_code: string | null;
  warehouse_name: string | null;
}

interface Props {
  products: ProductOption[];
  locations: LocationOption[];
  reasons: { code: string; label: string }[];
  initialProductId?: string | null;
}

function sectionCode(loc: LocationOption): string {
  return loc.section_code ?? "Unassigned";
}

/**
 * Cycle-count entry form.
 *
 * Form fields:
 *   - Product (custom Select, searchable — products list can be 25+ items)
 *   - Location (custom Select, options filtered to selected product)
 *   - Counted qty (Input, type=number)
 *   - Notes (Input, optional)
 *
 * The native <select>/native <input> usage was replaced because the
 * floating field-label was visually overlapping the displayed option text
 * and placeholders. The custom Select hides its trigger text when empty
 * (label fills the space); the shared Input component manages data-filled
 * for the qty/notes fields so their floating label snaps up correctly
 * once the field has a value.
 *
 * Submission is via the existing recordCycleCount server action. Hidden
 * inputs (product_id, location_id) carry the React state into the form
 * submission — same shape recordCycleCount expects, no server changes
 * needed.
 */
export function NewCountForm({
  products,
  locations,
  reasons,
  initialProductId,
}: Props) {
  const [, formAction] = useActionState(recordCycleCount, undefined);
  const [productId, setProductId] = useState(initialProductId ?? "");
  const [locationId, setLocationId] = useState("");
  const [countedQty, setCountedQty] = useState("");
  const [reasonCode, setReasonCode] = useState("");

  const productLocations = locations.filter((l) => l.product_id === productId);

  const canRecord =
    Boolean(productId) && Boolean(locationId) && countedQty.trim() !== "";

  const productOptions = products.map((p) => ({
    value: p.id,
    label: p.name,
    hint: p.barcode,
  }));

  const locationOptions = productLocations.map((l) => ({
    value: l.id,
    label: `${sectionCode(l)} · Bay ${l.bay ?? "?"} · L${l.level ?? "?"}`,
    hint: l.quantity != null ? `on hand: ${l.quantity}` : undefined,
  }));

  return (
    <form
      action={formAction}
      className="hairline bg-[var(--surface)] p-20 flex flex-col gap-16"
    >
      {/*
        Hidden inputs that actually submit — Select components are controlled
        by React state and don't have their own name/value form bindings
        (they could, via the `name` prop, but doing it this way keeps the
        old server-action signature unchanged).
      */}
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="location_id" value={locationId} />
      <input type="hidden" name="reason_code" value={reasonCode} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_auto] gap-12 items-start">
        <Select
          label="Product"
          value={productId}
          onChange={(v) => {
            setProductId(v);
            setLocationId(""); // reset location when product changes
          }}
          options={productOptions}
          placeholder="— Select —"
          required
          searchable
          ariaLabel="Product to count"
        />

        <Select
          label="Location"
          value={locationId}
          onChange={setLocationId}
          options={locationOptions}
          placeholder={productId ? "— Select —" : "— Pick a product first —"}
          disabled={!productId}
          required
          ariaLabel="Location to count"
        />

        <Input
          label="Counted qty"
          name="counted_qty"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={countedQty}
          onChange={(e) => setCountedQty(e.target.value)}
          disabled={!locationId}
          required
          className="tnum"
          aria-label="Counted quantity"
        />

        <div className="flex items-end">
          <CornerButton type="submit" variant="primary" disabled={!canRecord}>
            Record count
          </CornerButton>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-12">
        {reasons.length > 0 && (
          <Select
            label="Reason (optional)"
            value={reasonCode}
            onChange={setReasonCode}
            options={reasons.map((r) => ({ value: r.code, label: r.label }))}
            placeholder="— None —"
            ariaLabel="Adjustment reason"
          />
        )}
        <Input
          label="Notes (optional)"
          name="notes"
          type="text"
          maxLength={500}
          aria-label="Notes about this count"
        />
      </div>
    </form>
  );
}
