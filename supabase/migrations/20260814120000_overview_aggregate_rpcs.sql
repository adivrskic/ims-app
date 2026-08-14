-- Overview dashboard aggregation RPCs (2026-08-14 audit).
--
-- The Overview page is the post-login landing screen — the hottest read path in
-- the app. It was calling fetchAllPaged three times to pull whole tables into
-- Node and aggregate them in JS:
--
--   1. every active app.locations row, to SUM(quantity)
--   2. every app.scan_history row in a 14-day window, to bucket by day
--   3. every app.products row with reorder_point > 0 plus its locations, to
--      find the six most-understocked SKUs
--
-- lib/data/paginate.ts documents the rule that breaks, in its own docstring:
-- "Use this for COLD paths (reports, analytics)... For HOT read paths (ATP,
-- dashboards) prefer an SQL-side aggregate RPC." At the 100k-row cap each of
-- those is up to 100 sequential round trips. unstable_cache softened it, but
-- OverviewRealtime tag-busts that cache on every scan_history/locations event,
-- so the busier the warehouse the more often the full scan re-runs.
--
-- These three push the aggregation into Postgres: three round trips, fixed
-- size, no truncation risk.
--
-- All three are SECURITY INVOKER, matching app.product_movement_stats et al:
-- called through the caller's own client RLS still applies row-by-row, so a
-- spoofed p_org can only ever return rows the caller could already read.
-- (lib/data/overview.ts calls them with the service-role client, which bypasses
-- RLS either way and filters org_id explicitly.)
--
-- SEMANTICS ARE A DELIBERATE 1:1 PORT of the JS they replace, including one
-- inconsistency that is preserved rather than silently changed:
-- overview_stock_total counts quarantined units (the old locations sum did not
-- filter them) while overview_low_stock excludes them (the old embedded select
-- did filter them). Changing that shifts a number on the dashboard, so it is
-- called out here and left for a deliberate decision rather than folded into a
-- performance change.

-- ---------------------------------------------------------------------------
-- 1. Total units on hand.
--
-- Ports: locations.select("quantity").eq(org_id).eq(is_active,true)[.eq(
--        warehouse_id)] → JS reduce(sum + (quantity ?? 0)).
-- NOTE: does not exclude quarantined units — see the header comment.
-- ---------------------------------------------------------------------------
create or replace function app.overview_stock_total(
  p_org uuid,
  p_warehouse uuid default null
)
returns bigint
language sql
stable
security invoker
set search_path to 'app', 'public'
as $$
  select coalesce(sum(l.quantity), 0)::bigint
  from app.locations l
  where l.org_id = p_org
    and l.is_active = true
    and (p_warehouse is null or l.warehouse_id = p_warehouse)
$$;

-- ---------------------------------------------------------------------------
-- 2. Scan activity bucketed by day.
--
-- Ports: the 14-day scan_history pull + bucketByDay() in app/(app)/page.tsx.
--
-- p_start is the caller's LOCAL midnight for the oldest bucket (bucket 0), so
-- the buckets line up with the operator's calendar rather than UTC. Bucketing
-- is floor(elapsed days since p_start) — the same pure timestamp arithmetic
-- app.daily_demand_series uses, monotonic across DST.
--
-- Returns only non-empty buckets; the caller zero-fills. day_offset is
-- 0 .. p_days-1, where p_days-1 is "today".
-- ---------------------------------------------------------------------------
create or replace function app.overview_scan_trend(
  p_org uuid,
  p_start timestamptz,
  p_days integer,
  p_warehouse uuid default null
)
returns table(day_offset integer, scan_count bigint)
language sql
stable
security invoker
set search_path to 'app', 'public'
as $$
  select
    floor(extract(epoch from (s.scanned_at - p_start)) / 86400)::int,
    count(*)::bigint
  from app.scan_history s
  where s.org_id = p_org
    and s.scanned_at >= p_start
    and s.scanned_at < p_start + make_interval(days => p_days)
    and (p_warehouse is null or s.warehouse_id = p_warehouse)
  group by 1
$$;

-- ---------------------------------------------------------------------------
-- 3. Most-understocked SKUs.
--
-- Ports the products+locations embed and the JS map/filter/sort/slice:
--   on_hand   = sum of ACTIVE, NON-QUARANTINED location quantities
--   low       = on_hand <= reorder_point   (products with no stock rows → 0)
--   order     = on_hand - reorder_point ascending (deepest shortfall first)
--
-- Facility scoping matches the JS exactly: when p_warehouse is set, only
-- locations whose SECTION belongs to that facility count. Locations with a null
-- section_id therefore drop out when scoped (the JS `l.section_id &&` guard did
-- the same) but count when workspace-wide.
--
-- total_count is the full number of low-stock SKUs before the limit, window-
-- functioned onto every row — same shape as app.inventory_list, which
-- lib/data/kiosk.ts already reads this way.
-- ---------------------------------------------------------------------------
create or replace function app.overview_low_stock(
  p_org uuid,
  p_warehouse uuid default null,
  p_limit integer default 6
)
returns table(
  id uuid,
  name text,
  barcode text,
  reorder_point integer,
  category_name text,
  on_hand bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path to 'app', 'public'
as $$
  with scoped_locations as (
    select l.product_id as pid, sum(l.quantity) as qty
    from app.locations l
    where l.org_id = p_org
      and l.is_active = true
      and l.quarantined = false
      and l.product_id is not null
      and (
        p_warehouse is null
        or l.section_id in (
          select s.id
          from app.sections s
          where s.org_id = p_org
            and s.warehouse_id = p_warehouse
        )
      )
    group by l.product_id
  ),
  candidates as (
    select
      p.id,
      p.name,
      p.barcode,
      p.reorder_point,
      c.name as category_name,
      coalesce(sl.qty, 0)::bigint as on_hand
    from app.products p
    left join scoped_locations sl on sl.pid = p.id
    left join app.categories c on c.id = p.category_id
    where p.org_id = p_org
      and p.reorder_point > 0
  )
  select
    cd.id,
    cd.name,
    cd.barcode,
    cd.reorder_point,
    cd.category_name,
    cd.on_hand,
    count(*) over ()::bigint as total_count
  from candidates cd
  where cd.on_hand <= cd.reorder_point
  order by cd.on_hand - cd.reorder_point asc
  limit greatest(p_limit, 0)
$$;

-- ---------------------------------------------------------------------------
-- Supporting index for the locations rollup.
--
-- overview_low_stock groups active, non-quarantined locations by product_id.
-- The only existing (org_id, product_id) index is the QC one, which is
-- partial `where quarantined` — the exact complement of what this query reads,
-- so it can never serve it. Mirror it with the opposite predicate.
--
-- The trend query needs (org_id, scanned_at), already covered by
-- idx_scan_history_org_time from 20260703140000_perf_indexes — not repeated
-- here, since a duplicate index costs write throughput and buys nothing.
-- ---------------------------------------------------------------------------
create index if not exists idx_locations_org_product_active
  on app.locations (org_id, product_id)
  where is_active and not quarantined;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'app.overview_stock_total(uuid, uuid)',
    'app.overview_scan_trend(uuid, timestamptz, integer, uuid)',
    'app.overview_low_stock(uuid, uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
