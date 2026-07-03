-- Analytics aggregation RPCs (2026-07-02 audit batch 3).
--
-- Valuation, forecast, backorders, and dead-stock previously shipped raw rows
-- to Node (sequential 1000-row pages; dead-stock silently capped at ~1000) and
-- aggregated in JS. These push the aggregation into SQL where it belongs.
--
-- All four are SECURITY INVOKER: called through the caller's own client, RLS
-- still applies row-by-row, so a spoofed p_org can only ever return rows the
-- caller could already read. Safe to grant to authenticated.

-- Valuation: on-hand + last movement per product, one round trip.
create or replace function app.product_movement_stats(
  p_org uuid,
  p_warehouse uuid default null
)
returns table(product_id uuid, on_hand bigint, last_scanned_at timestamptz)
language sql
stable
security invoker
set search_path to 'app', 'public'
as $$
  with onhand as (
    select l.product_id as pid, sum(l.quantity)::bigint as qty
    from app.locations l
    where l.org_id = p_org
      and l.product_id is not null
      and (p_warehouse is null or l.warehouse_id = p_warehouse)
    group by l.product_id
  ),
  lastmove as (
    select s.product_id as pid, max(s.scanned_at) as last_at
    from app.scan_history s
    where s.org_id = p_org
      and s.product_id is not null
      and (p_warehouse is null or s.warehouse_id = p_warehouse)
    group by s.product_id
  )
  select coalesce(o.pid, m.pid), coalesce(o.qty, 0), m.last_at
  from onhand o
  full outer join lastmove m on m.pid = o.pid
$$;

-- Forecast: demand bucketed by day offset from the window start.
-- Bucketing is pure timestamp arithmetic (floor of elapsed days since
-- p_start), which is monotonic across DST — same guarantee the JS rounding
-- fix provided, without shipping the raw rows.
create or replace function app.daily_demand_series(
  p_org uuid,
  p_start timestamptz,
  p_days integer,
  p_warehouse uuid default null,
  p_products uuid[] default null
)
returns table(product_id uuid, day_offset integer, qty bigint)
language sql
stable
security invoker
set search_path to 'app', 'public'
as $$
  select
    s.product_id,
    floor(extract(epoch from (s.scanned_at - p_start)) / 86400)::int,
    sum(abs(coalesce(s.quantity, 0)))::bigint
  from app.scan_history s
  where s.org_id = p_org
    and s.action in ('pick', 'adjust')
    and s.product_id is not null
    and s.scanned_at >= p_start
    and s.scanned_at < p_start + make_interval(days => p_days)
    and (p_warehouse is null or s.warehouse_id = p_warehouse)
    and (p_products is null or s.product_id = any(p_products))
  group by 1, 2
$$;

-- Backorders: PostgREST can't compare two columns, so the allocated-vs-
-- requested filter lives here. Oldest order first (backorders age into
-- priority).
create or replace function app.backorder_lines(
  p_org uuid,
  p_statuses text[],
  p_warehouse uuid default null
)
returns table(
  order_item_id uuid,
  order_id uuid,
  order_number text,
  order_status text,
  created_at timestamptz,
  warehouse_id uuid,
  product_id uuid,
  product_name text,
  sku text,
  requested integer,
  allocated integer,
  backordered integer
)
language sql
stable
security invoker
set search_path to 'app', 'public'
as $$
  select
    oi.id,
    o.id,
    o.order_number::text,
    o.status::text,
    o.created_at,
    o.warehouse_id,
    oi.product_id,
    p.name::text,
    p.internal_sku::text,
    coalesce(oi.quantity_requested, 0),
    coalesce(oi.quantity_allocated, 0),
    coalesce(oi.quantity_requested, 0) - coalesce(oi.quantity_allocated, 0)
  from app.order_items oi
  join app.orders o on o.id = oi.order_id
  left join app.products p on p.id = oi.product_id
  where o.org_id = p_org
    and o.status::text = any(p_statuses)
    and (p_warehouse is null or o.warehouse_id = p_warehouse)
    and coalesce(oi.quantity_requested, 0) > coalesce(oi.quantity_allocated, 0)
  order by o.created_at asc nulls last, oi.id asc
$$;

-- Dead stock: last pick per product since a cutoff. Replaces two raw-row
-- fetches (one of which silently truncated at PostgREST's 1000-row cap,
-- making results WRONG at scale, not just slow). No org param: the page
-- queries through the RLS client, which already scopes rows.
create or replace function app.last_pick_stats(
  p_since timestamptz,
  p_warehouse uuid default null
)
returns table(product_id uuid, last_pick_at timestamptz)
language sql
stable
security invoker
set search_path to 'app', 'public'
as $$
  select s.product_id, max(s.scanned_at)
  from app.scan_history s
  where s.action = 'pick'
    and s.product_id is not null
    and s.scanned_at >= p_since
    and (p_warehouse is null or s.warehouse_id = p_warehouse)
  group by s.product_id
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'app.product_movement_stats(uuid, uuid)',
    'app.daily_demand_series(uuid, timestamptz, integer, uuid, uuid[])',
    'app.backorder_lines(uuid, text[], uuid)',
    'app.last_pick_stats(timestamptz, uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
