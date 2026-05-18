"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CornerButton } from "@/components/ui/CornerButton";
import { recordCycleCount } from "./actions";

interface ProductLocation {
  id: string;
  bay: number;
  level: number;
  quantity: number | null;
  section:
    | { code: string; name: string }
    | { code: string; name: string }[]
    | null;
}

interface Product {
  id: string;
  name: string;
  barcode: string;
  locations: ProductLocation[];
}

interface Props {
  products: Product[];
}

function sectionCode(loc: ProductLocation): string {
  const sec = Array.isArray(loc.section) ? loc.section[0] : loc.section;
  return sec?.code ?? "Unassigned";
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
export function NewCountForm({ products }: Props) {
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [countedQty, setCountedQty] = useState("");

  const selectedProduct = products.find((p) => p.id === productId) ?? null;
  const locations = selectedProduct?.locations ?? [];

  const canRecord =
    Boolean(productId) && Boolean(locationId) && countedQty.trim() !== "";

  const productOptions = products.map((p) => ({
    value: p.id,
    label: p.name,
    hint: p.barcode,
  }));

  const locationOptions = locations.map((l) => ({
    value: l.id,
    label: `${sectionCode(l)} · Bay ${l.bay} · L${l.level}`,
    hint: l.quantity != null ? `on hand: ${l.quantity}` : undefined,
  }));

  return (
    <form
      action={recordCycleCount}
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

      <Input
        label="Notes (optional)"
        name="notes"
        type="text"
        maxLength={500}
        aria-label="Notes about this count"
      />
    </form>
  );
}
