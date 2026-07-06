/**
 * FIFO cost layering — pure math, no DB access (mirrors lib/replenishment).
 *
 * There is no per-receipt consumption ledger, so layers are DERIVED:
 * every receipt (po_line_items with quantity_received > 0) is a cost layer in
 * received order, and total consumption = total received − current on-hand.
 * FIFO consumes the OLDEST layers first, so what remains on the shelf is the
 * NEWEST layers — walk the layers oldest→newest subtracting consumption, and
 * value whatever survives at each layer's own cost.
 *
 * Stock that was never received through a PO (manual adjustments, opening
 * balances, restocked returns) shows up as on-hand exceeding total receipts;
 * that excess is valued at the product's current unit cost (the same
 * weighted-average-style cost the rest of the valuation report uses) and
 * reported separately so the UI can qualify the number.
 */

export interface CostLayer {
  /** Units received into this layer. */
  qty: number;
  /** Per-unit cost for this layer (landed cost when known). */
  unitCost: number;
  /** ISO timestamp of receipt — layers are consumed in this order. */
  receivedAt: string;
}

export interface FifoResult {
  /** Total FIFO value of the on-hand units. */
  value: number;
  /** Units valued from receipt layers. */
  layeredUnits: number;
  /** On-hand units with no receipt history (valued at fallbackCost). */
  unlayeredUnits: number;
  /** Surviving layers, oldest first (qty = remaining units in the layer). */
  remaining: Array<{ qty: number; unitCost: number; receivedAt: string }>;
}

/**
 * Value `onHand` units against receipt layers, FIFO.
 *
 * @param layers        receipt layers in ANY order (sorted internally)
 * @param onHand        current physical units for the product
 * @param fallbackCost  cost applied to units beyond all receipts (0 = uncosted)
 */
export function fifoValue(
  layers: CostLayer[],
  onHand: number,
  fallbackCost: number
): FifoResult {
  const clean = layers
    .filter((l) => l.qty > 0)
    .slice()
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

  const totalReceived = clean.reduce((s, l) => s + l.qty, 0);
  const stock = Math.max(0, onHand);

  // Units consumed since the beginning of history, FIFO — clamped so an
  // on-hand above total receipts consumes nothing.
  let toConsume = Math.max(0, totalReceived - stock);

  const remaining: FifoResult["remaining"] = [];
  for (const layer of clean) {
    if (toConsume >= layer.qty) {
      toConsume -= layer.qty;
      continue;
    }
    const left = layer.qty - toConsume;
    toConsume = 0;
    remaining.push({
      qty: left,
      unitCost: layer.unitCost,
      receivedAt: layer.receivedAt,
    });
  }

  const layeredUnits = remaining.reduce((s, l) => s + l.qty, 0);
  const unlayeredUnits = Math.max(0, stock - layeredUnits);
  const value =
    remaining.reduce((s, l) => s + l.qty * l.unitCost, 0) +
    unlayeredUnits * Math.max(0, fallbackCost);

  return { value, layeredUnits, unlayeredUnits, remaining };
}
