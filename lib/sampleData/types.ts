/**
 * The marker stored in orgs.sample_data while demo data is loaded. Pure
 * types + helpers, safe for client components and the overview page.
 */

export const SAMPLE_DATA_VERSION = 1;

export interface SampleDataIds {
  categories: string[];
  suppliers: string[];
  customers: string[];
  sections: string[];
  products: string[];
  purchase_orders: string[];
  orders: string[];
  scans: string[];
}

export interface SampleDataMarker {
  version: number;
  seeded_at: string;
  seeded_by: string | null;
  warehouse_id: string | null;
  ids: SampleDataIds;
}

export function emptySampleIds(): SampleDataIds {
  return {
    categories: [],
    suppliers: [],
    customers: [],
    sections: [],
    products: [],
    purchase_orders: [],
    orders: [],
    scans: [],
  };
}

export interface SampleCounts {
  products: number;
  suppliers: number;
  customers: number;
  sections: number;
  orders: number;
  purchaseOrders: number;
  scans: number;
  /** Sample scans still inside the overview's 14-day activity window. */
  scansInWindow: number;
}

const ACTIVITY_WINDOW_DAYS = 14;

/**
 * How many rows of each kind the sample set contributed, so the overview can
 * judge "has this customer started?" on their own data only. Sample scans are
 * all dated within 14 days of seeding, so they age out of the activity window.
 */
export function sampleCounts(
  marker: SampleDataMarker | null | undefined,
  now: Date = new Date()
): SampleCounts {
  if (!marker) {
    return {
      products: 0,
      suppliers: 0,
      customers: 0,
      sections: 0,
      orders: 0,
      purchaseOrders: 0,
      scans: 0,
      scansInWindow: 0,
    };
  }
  const ids = marker.ids;
  const seededAt = Date.parse(marker.seeded_at);
  const ageDays = Number.isFinite(seededAt)
    ? (now.getTime() - seededAt) / 86_400_000
    : 0;
  return {
    products: ids.products.length,
    suppliers: ids.suppliers.length,
    customers: ids.customers.length,
    sections: ids.sections.length,
    orders: ids.orders.length,
    purchaseOrders: ids.purchase_orders.length,
    scans: ids.scans.length,
    scansInWindow: ageDays > ACTIVITY_WINDOW_DAYS ? 0 : ids.scans.length,
  };
}
