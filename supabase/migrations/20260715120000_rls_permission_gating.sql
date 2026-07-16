-- RLS write-policy hardening: enforce granular RBAC at the database layer.
--
-- Every app-schema write policy previously checked org *membership* only
-- (app.is_org_member), so any authenticated member could write catalog / PO /
-- stock tables directly via PostgREST regardless of role or permission —
-- the app-layer ctx.can() checks were advisory for anyone speaking REST.
--
-- app.has_any_perm() resolves the exact permission model the app uses
-- (lib/permissions.ts effectivePermissions):
--   owner                         -> every permission
--   explicit permissions[] set    -> that set (overrides role default)
--   admin, no explicit set        -> every permission
--   member, no explicit set       -> MEMBER_DEFAULTS
--
-- All stock-mutation RPCs are SECURITY INVOKER, so these policies gate the
-- RPC paths too. Desk server actions already check the same permission keys
-- before writing, so permitted users are unaffected.
--
-- The pre-existing FOR ALL policies also served SELECT (the 2026-07-03
-- consolidation dropped the separate select policies), so each table gets an
-- explicit membership-scoped SELECT policy alongside permission-gated I/U/D.
-- Applied live as three MCP migrations (rls_permission_gating,
-- *_select_policies, *_split_all_policies); this file is the consolidated
-- equivalent.
--
-- MEMBER_DEFAULTS below MUST stay in sync with lib/permissions.ts.

create or replace function app.has_any_perm(target_org_id uuid, perms text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.org_members m
    where m.org_id = target_org_id
      and m.user_id = (select auth.uid())
      and (
        m.role = 'owner'
        or (m.permissions is not null and m.permissions && perms)
        or (m.permissions is null and (
          m.role = 'admin'
          or perms && array[
            'inventory.adjust','orders.manage','orders.allocate','customers.manage',
            'picking.manage','purchasing.receive','suppliers.manage','qc.review',
            'work_orders.manage','reports.manage'
          ]
        ))
      )
  );
$$;

revoke all on function app.has_any_perm(uuid, text[]) from public, anon;
grant execute on function app.has_any_perm(uuid, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- products: catalog CRUD is inventory.manage (matches desk createProduct /
-- updateProduct / deleteProduct gates and mobile's admin+ edit/delete gates).
-- ---------------------------------------------------------------------------
drop policy if exists products_write on app.products;
create policy products_select on app.products
  for select using (app.is_org_member(org_id));
create policy products_insert on app.products
  for insert with check (app.has_any_perm(org_id, array['inventory.manage']));
create policy products_update on app.products
  for update using (app.has_any_perm(org_id, array['inventory.manage']))
  with check (app.has_any_perm(org_id, array['inventory.manage']));
create policy products_delete on app.products
  for delete using (app.has_any_perm(org_id, array['inventory.manage']));

-- ---------------------------------------------------------------------------
-- locations: stock rows. Adjust/relocate (inventory.adjust), registration and
-- import (inventory.manage), receive-to-stock (purchasing.receive), QC
-- quarantine flips (qc.review). Member defaults keep all floor flows working.
-- ---------------------------------------------------------------------------
drop policy if exists locations_write on app.locations;
create policy locations_select on app.locations
  for select using (app.is_org_member(org_id));
create policy locations_insert on app.locations
  for insert with check (app.has_any_perm(org_id, array['inventory.adjust','inventory.manage','purchasing.receive']));
create policy locations_update on app.locations
  for update using (app.has_any_perm(org_id, array['inventory.adjust','inventory.manage','purchasing.receive','qc.review']))
  with check (app.has_any_perm(org_id, array['inventory.adjust','inventory.manage','purchasing.receive','qc.review']));
create policy locations_delete on app.locations
  for delete using (app.has_any_perm(org_id, array['inventory.adjust','inventory.manage']));

-- ---------------------------------------------------------------------------
-- purchase orders: create/cancel/delete is purchasing.manage; receiving flows
-- (line receive + parent status recompute) also allowed via purchasing.receive.
-- ---------------------------------------------------------------------------
drop policy if exists po_write on app.purchase_orders;
create policy po_select on app.purchase_orders
  for select using (app.is_org_member(org_id));
create policy po_insert on app.purchase_orders
  for insert with check (app.has_any_perm(org_id, array['purchasing.manage']));
create policy po_update on app.purchase_orders
  for update using (app.has_any_perm(org_id, array['purchasing.manage','purchasing.receive']))
  with check (app.has_any_perm(org_id, array['purchasing.manage','purchasing.receive']));
create policy po_delete on app.purchase_orders
  for delete using (app.has_any_perm(org_id, array['purchasing.manage']));

drop policy if exists po_li_write on app.po_line_items;
create policy po_li_select on app.po_line_items
  for select using (exists (
    select 1 from app.purchase_orders p
    where p.id = po_line_items.po_id and app.is_org_member(p.org_id)
  ));
create policy po_li_insert on app.po_line_items
  for insert with check (exists (
    select 1 from app.purchase_orders p
    where p.id = po_line_items.po_id
      and app.has_any_perm(p.org_id, array['purchasing.manage'])
  ));
create policy po_li_update on app.po_line_items
  for update using (exists (
    select 1 from app.purchase_orders p
    where p.id = po_line_items.po_id
      and app.has_any_perm(p.org_id, array['purchasing.manage','purchasing.receive','qc.review'])
  ))
  with check (exists (
    select 1 from app.purchase_orders p
    where p.id = po_line_items.po_id
      and app.has_any_perm(p.org_id, array['purchasing.manage','purchasing.receive','qc.review'])
  ));
create policy po_li_delete on app.po_line_items
  for delete using (exists (
    select 1 from app.purchase_orders p
    where p.id = po_line_items.po_id
      and app.has_any_perm(p.org_id, array['purchasing.manage'])
  ));

-- ---------------------------------------------------------------------------
-- inbound ASNs: authored under purchasing.manage, received under either.
-- ---------------------------------------------------------------------------
drop policy if exists asns_rw on app.asns;
create policy asns_select on app.asns
  for select using (app.is_org_member(org_id));
create policy asns_insert on app.asns
  for insert with check (app.has_any_perm(org_id, array['purchasing.manage']));
create policy asns_update on app.asns
  for update using (app.has_any_perm(org_id, array['purchasing.manage','purchasing.receive']))
  with check (app.has_any_perm(org_id, array['purchasing.manage','purchasing.receive']));
create policy asns_delete on app.asns
  for delete using (app.has_any_perm(org_id, array['purchasing.manage']));

drop policy if exists asn_lines_rw on app.asn_lines;
create policy asn_lines_select on app.asn_lines
  for select using (app.is_org_member(org_id));
create policy asn_lines_insert on app.asn_lines
  for insert with check (app.has_any_perm(org_id, array['purchasing.manage']));
create policy asn_lines_update on app.asn_lines
  for update using (app.has_any_perm(org_id, array['purchasing.manage','purchasing.receive']))
  with check (app.has_any_perm(org_id, array['purchasing.manage','purchasing.receive']));
create policy asn_lines_delete on app.asn_lines
  for delete using (app.has_any_perm(org_id, array['purchasing.manage']));

-- ---------------------------------------------------------------------------
-- lots: created at receive (purchasing.receive) or by catalog/stock managers.
-- ---------------------------------------------------------------------------
drop policy if exists lots_write on app.lots;
create policy lots_select on app.lots
  for select using (app.is_org_member(org_id));
create policy lots_insert on app.lots
  for insert with check (app.has_any_perm(org_id, array['purchasing.receive','inventory.adjust','inventory.manage']));
create policy lots_update on app.lots
  for update using (app.has_any_perm(org_id, array['purchasing.receive','inventory.adjust','inventory.manage']))
  with check (app.has_any_perm(org_id, array['purchasing.receive','inventory.adjust','inventory.manage']));
create policy lots_delete on app.lots
  for delete using (app.has_any_perm(org_id, array['purchasing.receive','inventory.adjust','inventory.manage']));

-- ---------------------------------------------------------------------------
-- returns: logged/dispositioned/restocked under inventory.adjust or
-- orders.manage (desk create-return-from-order path).
-- ---------------------------------------------------------------------------
drop policy if exists returns_write on app.returns;
create policy returns_select on app.returns
  for select using (app.is_org_member(org_id));
create policy returns_insert on app.returns
  for insert with check (app.has_any_perm(org_id, array['inventory.adjust','orders.manage']));
create policy returns_update on app.returns
  for update using (app.has_any_perm(org_id, array['inventory.adjust','orders.manage']))
  with check (app.has_any_perm(org_id, array['inventory.adjust','orders.manage']));
create policy returns_delete on app.returns
  for delete using (app.has_any_perm(org_id, array['inventory.adjust','orders.manage']));

-- ---------------------------------------------------------------------------
-- cycle count tasks: queue rows are managed by crons (service_role bypasses
-- RLS); on-floor execution/completion is an inventory.adjust capability.
-- ---------------------------------------------------------------------------
drop policy if exists cycle_count_tasks_all on app.cycle_count_tasks;
create policy cycle_count_tasks_select on app.cycle_count_tasks
  for select using (app.is_org_member(org_id));
create policy cycle_count_tasks_insert on app.cycle_count_tasks
  for insert with check (app.has_any_perm(org_id, array['inventory.adjust']));
create policy cycle_count_tasks_update on app.cycle_count_tasks
  for update using (app.has_any_perm(org_id, array['inventory.adjust']))
  with check (app.has_any_perm(org_id, array['inventory.adjust']));
create policy cycle_count_tasks_delete on app.cycle_count_tasks
  for delete using (app.has_any_perm(org_id, array['inventory.adjust']));

-- ---------------------------------------------------------------------------
-- orders / order_items / pick_waves: manage vs. floor execution (picking,
-- allocation) — pick_order_item / allocate_order / fill_backorders are
-- INVOKER RPCs that update order_items + orders under the caller's perms.
-- ---------------------------------------------------------------------------
drop policy if exists orders_write on app.orders;
create policy orders_select on app.orders
  for select using (app.is_org_member(org_id));
create policy orders_insert on app.orders
  for insert with check (app.has_any_perm(org_id, array['orders.manage']));
create policy orders_update on app.orders
  for update using (app.has_any_perm(org_id, array['orders.manage','picking.manage','orders.allocate']))
  with check (app.has_any_perm(org_id, array['orders.manage','picking.manage','orders.allocate']));
create policy orders_delete on app.orders
  for delete using (app.has_any_perm(org_id, array['orders.manage']));

drop policy if exists order_items_write on app.order_items;
create policy order_items_select on app.order_items
  for select using (exists (
    select 1 from app.orders o
    where o.id = order_items.order_id and app.is_org_member(o.org_id)
  ));
create policy order_items_insert on app.order_items
  for insert with check (exists (
    select 1 from app.orders o
    where o.id = order_items.order_id
      and app.has_any_perm(o.org_id, array['orders.manage'])
  ));
create policy order_items_update on app.order_items
  for update using (exists (
    select 1 from app.orders o
    where o.id = order_items.order_id
      and app.has_any_perm(o.org_id, array['orders.manage','picking.manage','orders.allocate'])
  ))
  with check (exists (
    select 1 from app.orders o
    where o.id = order_items.order_id
      and app.has_any_perm(o.org_id, array['orders.manage','picking.manage','orders.allocate'])
  ));
create policy order_items_delete on app.order_items
  for delete using (exists (
    select 1 from app.orders o
    where o.id = order_items.order_id
      and app.has_any_perm(o.org_id, array['orders.manage'])
  ));

drop policy if exists pick_waves_write on app.pick_waves;
create policy pick_waves_select on app.pick_waves
  for select using (app.is_org_member(org_id));
create policy pick_waves_insert on app.pick_waves
  for insert with check (app.has_any_perm(org_id, array['picking.manage']));
create policy pick_waves_update on app.pick_waves
  for update using (app.has_any_perm(org_id, array['picking.manage']))
  with check (app.has_any_perm(org_id, array['picking.manage']));
create policy pick_waves_delete on app.pick_waves
  for delete using (app.has_any_perm(org_id, array['picking.manage']));

-- ---------------------------------------------------------------------------
-- stock adjustment requests: anyone who can adjust may queue one; only
-- adjustments.approve holders may resolve or delete.
-- ---------------------------------------------------------------------------
drop policy if exists stock_adj_req_write on app.stock_adjustment_requests;
create policy stock_adj_req_select on app.stock_adjustment_requests
  for select using (app.is_org_member(org_id));
create policy stock_adj_req_insert on app.stock_adjustment_requests
  for insert with check (app.has_any_perm(org_id, array['inventory.adjust']));
create policy stock_adj_req_update on app.stock_adjustment_requests
  for update using (app.has_any_perm(org_id, array['adjustments.approve']))
  with check (app.has_any_perm(org_id, array['adjustments.approve']));
create policy stock_adj_req_delete on app.stock_adjustment_requests
  for delete using (app.has_any_perm(org_id, array['adjustments.approve']));
