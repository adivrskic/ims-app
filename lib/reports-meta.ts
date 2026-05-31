/**
 * Report dataset METADATA — client-safe (no DB, no server-only).
 *
 * Describes each predefined dataset's selectable columns + filters so the
 * builder UI can render without importing the server-only run functions
 * (lib/data/reports.ts).
 */

export interface ReportColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export type FilterType = "select" | "date" | "boolean" | "text";

export interface ReportFilter {
  key: string;
  label: string;
  type: FilterType;
  options?: { value: string; label: string }[];
}

export interface ReportDatasetMeta {
  id: string;
  label: string;
  description: string;
  columns: ReportColumn[];
  filters: ReportFilter[];
}

export const REPORT_DATASETS_META: ReportDatasetMeta[] = [
  {
    id: "inventory",
    label: "Inventory",
    description: "Products with on-hand, reorder point, and value.",
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Name" },
      { key: "category", label: "Category" },
      { key: "manufacturer", label: "Manufacturer" },
      { key: "on_hand", label: "On hand", numeric: true },
      { key: "reorder_point", label: "Reorder point", numeric: true },
      { key: "unit_cost", label: "Unit cost", numeric: true },
      { key: "value", label: "Value", numeric: true },
    ],
    filters: [
      { key: "low_only", label: "Low stock only", type: "boolean" },
      { key: "category", label: "Category contains", type: "text" },
    ],
  },
  {
    id: "movements",
    label: "Stock movements",
    description: "scan_history — picks, adjustments, receipts, relocations.",
    columns: [
      { key: "scanned_at", label: "Date" },
      { key: "action", label: "Action" },
      { key: "product_name", label: "Product" },
      { key: "quantity", label: "Qty", numeric: true },
      { key: "reason_code", label: "Reason" },
      { key: "notes", label: "Notes" },
    ],
    filters: [
      {
        key: "action",
        label: "Action",
        type: "select",
        options: [
          { value: "", label: "Any" },
          { value: "pick", label: "Pick" },
          { value: "adjust", label: "Adjust" },
          { value: "receive", label: "Receive" },
          { value: "relocate", label: "Relocate" },
          { value: "putaway", label: "Putaway" },
          { value: "transfer", label: "Transfer" },
        ],
      },
      { key: "since", label: "Since", type: "date" },
      { key: "until", label: "Until", type: "date" },
    ],
  },
  {
    id: "orders",
    label: "Orders",
    description: "Orders with requested / allocated / picked totals.",
    columns: [
      { key: "order_number", label: "Order #" },
      { key: "order_type", label: "Type" },
      { key: "status", label: "Status" },
      { key: "customer_name", label: "Customer" },
      { key: "delivery_date", label: "Delivery" },
      { key: "requested", label: "Requested", numeric: true },
      { key: "allocated", label: "Allocated", numeric: true },
      { key: "picked", label: "Picked", numeric: true },
    ],
    filters: [
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "", label: "Any" },
          { value: "created", label: "Created" },
          { value: "pick_list_assigned", label: "Pick assigned" },
          { value: "in_progress", label: "In progress" },
          { value: "staged", label: "Staged" },
          { value: "ready", label: "Ready" },
          { value: "out_for_delivery", label: "Out for delivery" },
          { value: "complete", label: "Complete" },
          { value: "cancelled", label: "Cancelled" },
        ],
      },
      {
        key: "order_type",
        label: "Type",
        type: "select",
        options: [
          { value: "", label: "Any" },
          { value: "installer_job", label: "Installer job" },
          { value: "customer_pickup", label: "Customer pickup" },
          { value: "internal_transfer", label: "Internal transfer" },
          { value: "restock", label: "Restock" },
        ],
      },
    ],
  },
];

export function getDatasetMeta(id: string): ReportDatasetMeta | undefined {
  return REPORT_DATASETS_META.find((d) => d.id === id);
}

export interface ReportConfig {
  columns: string[];
  filters: Record<string, string>;
}
