-- C1 fix: SQL-side aggregation for the read-side ATP / availability contract.
--
-- getStockAvailability() previously pulled every locations row and every open
-- order_items row into the app and summed them in JS. Past PostgREST's ~1000-row
-- cap those selects silently truncated, understating `reserved` and OVERSTATING
-- ATP → oversell. Summing in Postgres is both correct (no cap) and cheaper (one
-- round-trip instead of thousands of rows over HTTP on every page load).
--
-- Contract mirrors lib/data/allocation.ts (READ side, post pick-decrement):
--   on_hand    = Σ locations.quantity  (is_active, NOT quarantined)
--   reserved   = Σ max(0, quantity_allocated − quantity_picked)  over OPEN orders
--   backordered= Σ max(0, quantity_requested − quantity_allocated) over OPEN orders
--   ATP        = on_hand − reserved   (computed by the caller)
--
-- p_warehouse_id null  → aggregate across every facility (org-wide, used by the
--                        product detail page).
-- p_product_ids  null  → cover every product with stock or open demand.

create or replace function app.stock_availability(
  p_org_id uuid,
  p_warehouse_id uuid default null,
  p_product_ids uuid[] default null
) returns table (
  product_id uuid,
  on_hand bigint,
  reserved bigint,
  backordered bigint
)
  language sql
  stable
  set search_path to ''
as $$
  with oh as (
    select l.product_id, sum(l.quantity)::bigint as on_hand
    from app.locations l
    where l.org_id = p_org_id
      and (p_warehouse_id is null or l.warehouse_id = p_warehouse_id)
      and l.is_active = true
      and l.quarantined = false          -- QC-held stock is owned but not available
      and l.product_id is not null
      and (p_product_ids is null or l.product_id = any(p_product_ids))
    group by l.product_id
  ),
  res as (
    select oi.product_id,
           sum(greatest(0, oi.quantity_allocated - coalesce(oi.quantity_picked, 0)))::bigint as reserved,
           sum(greatest(0, oi.quantity_requested - oi.quantity_allocated))::bigint as backordered
    from app.order_items oi
    join app.orders o on o.id = oi.order_id
    where o.org_id = p_org_id
      and (p_warehouse_id is null or o.warehouse_id = p_warehouse_id)
      and o.status::text = any(array[
        'created','pick_list_assigned','in_progress','staged','ready','out_for_delivery'
      ])
      and oi.product_id is not null
      and (p_product_ids is null or oi.product_id = any(p_product_ids))
    group by oi.product_id
  )
  select
    coalesce(oh.product_id, res.product_id) as product_id,
    coalesce(oh.on_hand, 0)                 as on_hand,
    coalesce(res.reserved, 0)               as reserved,
    coalesce(res.backordered, 0)            as backordered
  from oh
  full outer join res on res.product_id = oh.product_id;
$$;

revoke all on function app.stock_availability(uuid, uuid, uuid[]) from public;
grant execute on function app.stock_availability(uuid, uuid, uuid[]) to authenticated, service_role;
