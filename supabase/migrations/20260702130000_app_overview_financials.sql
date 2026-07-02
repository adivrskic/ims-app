-- Overview dashboard financial signals (page.tsx TODO): inventory value +
-- capital tied up in dead stock, aggregated in Postgres so they can't truncate
-- and stay one round-trip.
--
--   inventory_value  = Σ on_hand × unit_cost over active locations (incl.
--                      quarantined — owned stock counts toward value, matching
--                      the valuation report + the "Units on hand" KPI).
--   dead_stock_value = same, but only for products with on_hand > 0 and NO
--                      `pick` scan within p_dead_days (the dead-stock report's
--                      definition).
--   dead_stock_skus  = count of those dormant products.
--
-- Facility-scoped when p_warehouse is non-null, workspace-wide otherwise.
-- SECURITY INVOKER (default): RLS on locations/scan_history/products still
-- applies, so this is safe for the authenticated role; the app calls it via the
-- service-role admin client from the cached getOverviewData fetcher.

create or replace function app.overview_financials(
  p_org uuid,
  p_warehouse uuid default null,
  p_dead_days integer default 90
) returns table (
  inventory_value numeric,
  dead_stock_value numeric,
  dead_stock_skus bigint
)
  language sql
  stable
  set search_path to ''
as $$
  with onhand as (
    select l.product_id, sum(l.quantity) as qty
    from app.locations l
    where l.org_id = p_org
      and l.is_active = true
      and l.product_id is not null
      and (p_warehouse is null or l.warehouse_id = p_warehouse)
    group by l.product_id
  ),
  active as (
    select distinct s.product_id
    from app.scan_history s
    where s.org_id = p_org
      and s.action = 'pick'
      and s.scanned_at >= date_trunc('day', now()) - (p_dead_days * interval '1 day')
      and s.product_id is not null
      and (p_warehouse is null or s.warehouse_id = p_warehouse)
  ),
  valued as (
    select oh.qty * coalesce(p.unit_cost, 0) as val,
           (a.product_id is not null) as is_active
    from onhand oh
    join app.products p on p.id = oh.product_id and p.org_id = p_org
    left join active a on a.product_id = oh.product_id
    where oh.qty > 0
  )
  select
    coalesce(sum(val), 0)::numeric                                as inventory_value,
    coalesce(sum(val) filter (where not is_active), 0)::numeric   as dead_stock_value,
    count(*) filter (where not is_active)::bigint                 as dead_stock_skus
  from valued;
$$;

revoke all on function app.overview_financials(uuid, uuid, integer) from public;
grant execute on function app.overview_financials(uuid, uuid, integer) to authenticated, service_role;
