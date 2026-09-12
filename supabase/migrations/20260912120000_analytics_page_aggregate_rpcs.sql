-- Analytics page aggregation RPCs (2026-09-12 truncation audit).
--
-- Two analytics screens were still reducing raw rows in Node, so both went
-- silently WRONG past PostgREST's ~1000-row cap:
--
--   /analytics            — summed every app.locations row for "Units on hand",
--                           grouped every locations+section row for "Where units
--                           live", counted every app.scan_history row for the
--                           action mix, and pulled every reorder-point product
--                           WITH its embedded locations for the low-stock count.
--                           The KPIs beside them use exact head counts, so past
--                           ~1000 rows the bars disagreed with the headline.
--   /analytics/dead-stock — fetched the catalog ordered by name with limit(501)
--                           and analysed the first 500. Products 501+ were
--                           invisible, and the notice told the user to "narrow
--                           with a warehouse filter or a shorter threshold",
--                           neither of which moves a cap applied to products
--                           FETCHED by name.
--
-- lib/data/paginate.ts states the rule these broke: fetchAllPaged is for COLD
-- paths; hot read paths aggregate in SQL. /analytics is linked from the side
-- rail and loaded constantly, and the dead-stock catalog pull carried a nested
-- locations embed — the single heaviest query on either page. These push all of
-- it into Postgres: fixed-size responses, no truncation, one round trip each.
--
-- All SECURITY INVOKER, matching app.overview_* and app.product_movement_stats:
-- called through the caller's own RLS client, so a spoofed p_org can only ever
-- return rows the caller could already read.
--
-- SEMANTICS ARE A DELIBERATE 1:1 PORT of the JS they replace. Two carried-over
-- quirks are preserved rather than silently "fixed" here, because changing them
-- moves numbers on screen and that deserves its own decision:
--   * these sum ALL locations rows (no is_active / quarantined filter), which
--     is what the /analytics page did — app.overview_stock_total filters
--     is_active, so the two pages can still differ;
--   * dead stock scopes ON-HAND by warehouse but NOT pick activity, matching
--     the page's existing call to app.last_pick_stats with no p_warehouse.

-- ---------------------------------------------------------------------------
-- 1. Units on hand, broken down by section.
--
-- Ports: locations.select("quantity, section:sections(code,name,color)") →
--        JS Map keyed by trimmed section code + a separate full-table sum.
--
-- Returns ONE row per trimmed section code plus a single section_code = null
-- row holding stock in locations with no section, and carries the grand total
-- on every row as a window aggregate. The caller lists the non-null rows and
-- reads the total off any of them, so the section percentages are computed from
-- the same aggregate as the total they divide by and cannot drift apart again —
-- even in the (absurd) case of an org with enough sections to hit PostgREST's
-- row cap on this very response.
--
-- Sections sharing a code (same code in two facilities, workspace-wide view)
-- collapse into one bucket as they did in JS; min() picks the label/colour,
-- where the JS took whichever row it saw first.
-- ---------------------------------------------------------------------------
create or replace function app.analytics_stock_by_section(
  p_org uuid,
  p_warehouse uuid default null
)
returns table(
  section_code text,
  section_name text,
  section_color text,
  quantity bigint,
  total_quantity bigint
)
language sql
stable
security invoker
set search_path to 'app', 'public'
as $$
  with by_section as (
    select
      nullif(btrim(s.code), '')::text      as section_code,
      min(s.name)::text                    as section_name,
      min(s.color)::text                   as section_color,
      coalesce(sum(l.quantity), 0)::bigint as quantity
    from app.locations l
    left join app.sections s
      on s.id = l.section_id and s.org_id = p_org
    where l.org_id = p_org
      and (p_warehouse is null or l.warehouse_id = p_warehouse)
    group by nullif(btrim(s.code), '')
  )
  select
    b.section_code,
    b.section_name,
    b.section_color,
    b.quantity,
    coalesce(sum(b.quantity) over (), 0)::bigint as total_quantity
  from by_section b
$$;

-- ---------------------------------------------------------------------------
-- 2. Scan action mix.
--
-- Ports: scan_history.select("action") → JS Map count. No time window: the
-- percentages are against the page's exact lifetime scan count, so counting
-- anything less would disagree with it.
-- ---------------------------------------------------------------------------
create or replace function app.analytics_action_mix(
  p_org uuid,
  p_warehouse uuid default null
)
returns table(action text, scan_count bigint)
language sql
stable
security invoker
set search_path to 'app', 'public'
as $$
  select s.action::text, count(*)::bigint
  from app.scan_history s
  where s.org_id = p_org
    and (p_warehouse is null or s.warehouse_id = p_warehouse)
  group by s.action
$$;

-- ---------------------------------------------------------------------------
-- 3. Low-stock SKU count (workspace-wide).
--
-- Ports: products.select("id, reorder_point, locations(quantity)")
--        .gt("reorder_point", 0) → JS filter(on_hand <= reorder_point).
--
-- Deliberately NOT app.overview_low_stock: that one excludes inactive and
-- quarantined locations and can be facility-scoped. This page counts every
-- location row and stays workspace-wide (matching how its product count is
-- treated), so it gets its own 1:1 port instead of a semantics change smuggled
-- in under a truncation fix.
-- ---------------------------------------------------------------------------
create or replace function app.analytics_low_stock_count(p_org uuid)
returns bigint
language sql
stable
security invoker
set search_path to 'app', 'public'
as $$
  with onhand as (
    select l.product_id as pid, sum(l.quantity) as qty
    from app.locations l
    where l.org_id = p_org
      and l.product_id is not null
    group by l.product_id
  )
  select count(*)::bigint
  from app.products p
  left join onhand o on o.pid = p.id
  where p.org_id = p_org
    and p.reorder_point > 0
    and coalesce(o.qty, 0) <= p.reorder_point
$$;

-- ---------------------------------------------------------------------------
-- 4. Dead stock, whole catalog.
--
-- Replaces the limit(501) products+locations fetch AND the separate
-- app.last_pick_stats call on /analytics/dead-stock.
--
-- Dormant = has on-hand stock in scope AND no `pick` scan since p_threshold.
-- p_since is the display floor for "last picked" (the page shows "365+ days"
-- for anything older), kept as its own parameter so the threshold buttons only
-- change what counts as dormant, never what the date column can say.
--
-- Sorting happens here so p_limit takes the TOP rows by the sort the user
-- picked, not the alphabetical first N — that is what made the old truncation
-- notice's advice useless. The four total_* columns are window aggregates over
-- the FULL dormant set (windows run before LIMIT), so the summary KPIs stay
-- exact even when the table below them is capped.
-- ---------------------------------------------------------------------------
create or replace function app.dead_stock_rows(
  p_org uuid,
  p_threshold timestamptz,
  p_since timestamptz,
  p_warehouse uuid default null,
  p_sort text default 'value',
  p_limit integer default 500
)
returns table(
  id uuid,
  name text,
  barcode text,
  category_name text,
  on_hand bigint,
  unit_cost numeric,
  tied_value numeric,
  last_pick_at timestamptz,
  total_skus bigint,
  total_units bigint,
  total_value numeric,
  valued_skus bigint
)
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
  lastpick as (
    -- Workspace-wide on purpose: see the header note. Scoping picks by
    -- facility would change which products read as dormant.
    select s.product_id as pid, max(s.scanned_at) as last_at
    from app.scan_history s
    where s.org_id = p_org
      and s.action = 'pick'
      and s.product_id is not null
      and s.scanned_at >= p_since
    group by s.product_id
  ),
  dormant as (
    select
      p.id                                as id,
      p.name::text                        as name,
      p.barcode::text                     as barcode,
      c.name::text                        as category_name,
      o.qty                               as on_hand,
      p.unit_cost::numeric                as unit_cost,
      case
        when p.unit_cost is null then null
        else (p.unit_cost * o.qty)::numeric
      end                                 as tied_value,
      lp.last_at                          as last_pick_at
    from onhand o
    join app.products p on p.id = o.pid and p.org_id = p_org
    left join lastpick lp on lp.pid = o.pid
    left join app.categories c on c.id = p.category_id
    where o.qty > 0
      and (lp.last_at is null or lp.last_at < p_threshold)
  )
  select
    d.id,
    d.name,
    d.barcode,
    d.category_name,
    d.on_hand,
    d.unit_cost,
    d.tied_value,
    d.last_pick_at,
    count(*) over ()::bigint                                     as total_skus,
    coalesce(sum(d.on_hand) over (), 0)::bigint                  as total_units,
    coalesce(sum(coalesce(d.tied_value, 0)) over (), 0)::numeric as total_value,
    count(d.tied_value) over ()::bigint                          as valued_skus
  from dormant d
  order by
    -- Only the branch matching p_sort produces values; the others are NULL for
    -- every row and so contribute nothing to the ordering.
    case when p_sort = 'value' then coalesce(d.tied_value, -1) end desc,
    case when p_sort = 'quantity' then d.on_hand end desc,
    case
      when p_sort = 'days_inactive'
      then coalesce(extract(epoch from d.last_pick_at), 0)
    end asc,
    d.name asc
  limit greatest(p_limit, 0)
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'app.analytics_stock_by_section(uuid, uuid)',
    'app.analytics_action_mix(uuid, uuid)',
    'app.analytics_low_stock_count(uuid)',
    'app.dead_stock_rows(uuid, timestamptz, timestamptz, uuid, text, integer)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
