"use client";

import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

/**
 * Each component below mounts a realtime subscription and renders nothing.
 * Drop the matching component into a server-component page; the page's
 * server data fetches re-run automatically when relevant rows change.
 *
 * RLS scopes events to rows the user can read, so no extra org filter
 * is needed on the client. Add a `filter` only when narrowing inside
 * the user's authorized set (by warehouse, by user_id, by record id).
 */

interface ScopedProps {
  /** Active facility id, or null for workspace-wide. */
  warehouseId?: string | null;
}

export function OverviewRealtime({ warehouseId }: ScopedProps) {
  const whFilter = warehouseId ? `warehouse_id=eq.${warehouseId}` : undefined;
  useRealtimeRefresh({
    subscriptions: [
      { table: "scan_history", filter: whFilter },
      { table: "orders", filter: whFilter },
      { table: "purchase_orders", filter: whFilter },
      { table: "returns", filter: whFilter },
      { table: "notifications" },
    ],
  });
  return null;
}

export function NotificationsRealtime({ userId }: { userId: string }) {
  useRealtimeRefresh({
    subscriptions: [{ table: "notifications", filter: `user_id=eq.${userId}` }],
  });
  return null;
}

export function OrdersRealtime({ warehouseId }: ScopedProps) {
  useRealtimeRefresh({
    subscriptions: [
      {
        table: "orders",
        filter: warehouseId ? `warehouse_id=eq.${warehouseId}` : undefined,
      },
    ],
  });
  return null;
}

export function OrderDetailRealtime({ orderId }: { orderId: string }) {
  useRealtimeRefresh({
    subscriptions: [{ table: "orders", filter: `id=eq.${orderId}` }],
  });
  return null;
}

export function PurchaseOrdersRealtime({ warehouseId }: ScopedProps) {
  useRealtimeRefresh({
    subscriptions: [
      {
        table: "purchase_orders",
        filter: warehouseId ? `warehouse_id=eq.${warehouseId}` : undefined,
      },
      { table: "po_line_items" },
    ],
  });
  return null;
}

export function PurchaseOrderDetailRealtime({ poId }: { poId: string }) {
  useRealtimeRefresh({
    subscriptions: [
      { table: "purchase_orders", filter: `id=eq.${poId}` },
      { table: "po_line_items", filter: `po_id=eq.${poId}` },
    ],
  });
  return null;
}

/**
 * Returns are created/dispositioned externally (mobile receiving-dock app),
 * so the web list relies on this subscription to stay live — there's no
 * web mutation to revalidate the tag. Scoped by facility when one is active.
 */
export function ReturnsRealtime({ warehouseId }: ScopedProps) {
  useRealtimeRefresh({
    subscriptions: [
      {
        table: "returns",
        filter: warehouseId ? `warehouse_id=eq.${warehouseId}` : undefined,
      },
    ],
  });
  return null;
}

export function CycleCountsRealtime() {
  useRealtimeRefresh({
    subscriptions: [{ table: "cycle_counts" }],
  });
  return null;
}

export function ProductDetailRealtime({ productId }: { productId: string }) {
  useRealtimeRefresh({
    subscriptions: [
      { table: "scan_history", filter: `product_id=eq.${productId}` },
      { table: "locations", filter: `product_id=eq.${productId}` },
      { table: "cycle_counts", filter: `product_id=eq.${productId}` },
    ],
  });
  return null;
}

export function InventoryRealtime({ warehouseId }: ScopedProps) {
  useRealtimeRefresh({
    subscriptions: [
      {
        table: "scan_history",
        filter: warehouseId ? `warehouse_id=eq.${warehouseId}` : undefined,
      },
      {
        table: "locations",
        filter: warehouseId ? `warehouse_id=eq.${warehouseId}` : undefined,
      },
    ],
    debounceMs: 600, // inventory list is heavier; coalesce more
  });
  return null;
}