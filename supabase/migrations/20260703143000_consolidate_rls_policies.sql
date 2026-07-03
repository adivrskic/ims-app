-- Consolidate redundant permissive RLS policies (advisor: multiple_permissive_policies).
--
-- Two patterns, both purely mechanical — row visibility is unchanged:
--
-- 1. Tables with a FOR SELECT policy whose qual/roles are IDENTICAL to the
--    table's FOR ALL policy. FOR ALL already covers SELECT, so the standalone
--    SELECT policy only made every read evaluate the same condition twice.
--    Verified identical via pg_policies (qual, roles, permissive) before
--    dropping. 21 tables.
--
-- 2. Tables where the FOR ALL write policy (admin-only) overlapped a broader
--    member SELECT policy. Admins are members, so ALL's implicit SELECT grant
--    added nothing — splitting the write policy into INSERT/UPDATE/DELETE
--    removes the overlap while keeping the exact same write conditions.

-- ── Pattern 1: drop the duplicate SELECT policies ─────────────────────────
drop policy if exists adjustment_reasons_select on app.adjustment_reasons;
drop policy if exists customers_select on app.customers;
drop policy if exists kit_components_select on app.kit_components;
drop policy if exists layout_elements_select on app.layout_elements;
drop policy if exists snapshots_select on app.layout_snapshots;
drop policy if exists locations_select on app.locations;
drop policy if exists lots_select on app.lots;
drop policy if exists order_items_select on app.order_items;
drop policy if exists orders_select on app.orders;
drop policy if exists pick_waves_select on app.pick_waves;
drop policy if exists po_li_select on app.po_line_items;
drop policy if exists products_select on app.products;
drop policy if exists po_select on app.purchase_orders;
drop policy if exists returns_select on app.returns;
drop policy if exists saved_reports_select on app.saved_reports;
drop policy if exists sections_select on app.sections;
drop policy if exists serial_units_select on app.serial_units;
drop policy if exists stock_adj_req_select on app.stock_adjustment_requests;
drop policy if exists webhook_endpoints_read on app.webhook_endpoints;
drop policy if exists work_order_lines_select on app.work_order_lines;
drop policy if exists work_orders_select on app.work_orders;

-- ── Pattern 2: split admin-only FOR ALL into I/U/D ────────────────────────
drop policy if exists categories_write on app.categories;
create policy categories_insert on app.categories for insert
  with check (app.has_org_role(org_id, array['owner', 'admin']));
create policy categories_update on app.categories for update
  using (app.has_org_role(org_id, array['owner', 'admin']))
  with check (app.has_org_role(org_id, array['owner', 'admin']));
create policy categories_delete on app.categories for delete
  using (app.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists integrations_write on app.integrations;
create policy integrations_insert on app.integrations for insert
  with check (app.has_org_role(org_id, array['owner', 'admin']));
create policy integrations_update on app.integrations for update
  using (app.has_org_role(org_id, array['owner', 'admin']))
  with check (app.has_org_role(org_id, array['owner', 'admin']));
create policy integrations_delete on app.integrations for delete
  using (app.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists suppliers_write on app.suppliers;
create policy suppliers_insert on app.suppliers for insert
  with check (app.has_org_role(org_id, array['owner', 'admin']));
create policy suppliers_update on app.suppliers for update
  using (app.has_org_role(org_id, array['owner', 'admin']))
  with check (app.has_org_role(org_id, array['owner', 'admin']));
create policy suppliers_delete on app.suppliers for delete
  using (app.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists wa_write on app.warehouse_access;
create policy wa_insert on app.warehouse_access for insert
  with check (exists (
    select 1 from app.warehouses w
    where w.id = warehouse_access.warehouse_id
      and app.has_org_role(w.org_id, array['owner', 'admin'])
  ));
create policy wa_update on app.warehouse_access for update
  using (exists (
    select 1 from app.warehouses w
    where w.id = warehouse_access.warehouse_id
      and app.has_org_role(w.org_id, array['owner', 'admin'])
  ))
  with check (exists (
    select 1 from app.warehouses w
    where w.id = warehouse_access.warehouse_id
      and app.has_org_role(w.org_id, array['owner', 'admin'])
  ));
create policy wa_delete on app.warehouse_access for delete
  using (exists (
    select 1 from app.warehouses w
    where w.id = warehouse_access.warehouse_id
      and app.has_org_role(w.org_id, array['owner', 'admin'])
  ));
