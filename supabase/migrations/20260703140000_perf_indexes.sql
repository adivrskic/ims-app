-- Performance indexes (2026-07-02 audit batch 3).
--
-- Composites for the hottest read shapes, plus covering indexes for the
-- app-schema foreign keys the Supabase advisor flagged as unindexed.
-- Additive only; tables are small today so these build instantly, and the
-- read paths they serve (overview, kiosk, forecast, velocity, orders/PO
-- lists, ASN/wave/WO detail joins) stop degrading as scan_history grows.

-- scan_history: nearly every read filters org_id + scanned_at range,
-- often with action; velocity windows filter product_id + scanned_at.
create index if not exists idx_scan_history_org_time
  on app.scan_history (org_id, scanned_at desc);
create index if not exists idx_scan_history_org_action_time
  on app.scan_history (org_id, action, scanned_at desc);
create index if not exists idx_scan_history_product_time
  on app.scan_history (product_id, scanned_at desc);

-- Orders / POs: list pages filter org + status, order by created_at desc.
create index if not exists idx_orders_org_status_created
  on app.orders (org_id, status, created_at desc);
create index if not exists idx_purchase_orders_org_status_created
  on app.purchase_orders (org_id, status, created_at desc);

-- Advisor-flagged unindexed foreign keys (app schema).
create index if not exists idx_asn_lines_po_line on app.asn_lines (po_line_id);
create index if not exists idx_asn_lines_product on app.asn_lines (product_id);
create index if not exists idx_asns_created_by on app.asns (created_by);
create index if not exists idx_asns_supplier on app.asns (supplier_id);
create index if not exists idx_asns_warehouse on app.asns (warehouse_id);
create index if not exists idx_locations_po_line on app.locations (po_line_id);
create index if not exists idx_pick_waves_assigned_to on app.pick_waves (assigned_to);
create index if not exists idx_pick_waves_created_by on app.pick_waves (created_by);
create index if not exists idx_pick_waves_warehouse on app.pick_waves (warehouse_id);
create index if not exists idx_po_line_items_qc_by on app.po_line_items (qc_by);
create index if not exists idx_saved_reports_created_by on app.saved_reports (created_by);
create index if not exists idx_serial_units_lot on app.serial_units (lot_id);
create index if not exists idx_sar_location on app.stock_adjustment_requests (location_id);
create index if not exists idx_sar_product on app.stock_adjustment_requests (product_id);
create index if not exists idx_sar_requested_by on app.stock_adjustment_requests (requested_by);
create index if not exists idx_sar_reviewed_by on app.stock_adjustment_requests (reviewed_by);
create index if not exists idx_sar_warehouse on app.stock_adjustment_requests (warehouse_id);
create index if not exists idx_wo_lines_component_product on app.work_order_lines (component_product_id);
create index if not exists idx_wo_lines_org on app.work_order_lines (org_id);
create index if not exists idx_work_orders_assigned_to on app.work_orders (assigned_to);
create index if not exists idx_work_orders_created_by on app.work_orders (created_by);
create index if not exists idx_work_orders_warehouse on app.work_orders (warehouse_id);
