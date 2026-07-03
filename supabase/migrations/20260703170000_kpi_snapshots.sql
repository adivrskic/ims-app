-- KPI history: nightly snapshots powering Overview sparklines/trends.
--
-- Overview KPIs were point-in-time only. app.capture_kpi_snapshots() writes
-- one row per (org, scope, day) — scope = workspace-wide (warehouse_id null)
-- plus each active facility — capturing the headline numbers the dashboard
-- shows: inventory value, dead-stock value, units on hand, low-stock SKUs,
-- open orders. pg_cron runs it nightly and calls it DIRECTLY in SQL (no HTTP
-- hop — unlike the alert crons there's no app code involved). Upserts, so
-- re-runs within a day refresh that day's row.

create table if not exists app.kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.orgs(id) on delete cascade,
  -- null = workspace-wide scope; matches the Overview scope switcher.
  warehouse_id uuid references app.warehouses(id) on delete cascade,
  snapshot_date date not null default current_date,
  inventory_value numeric not null default 0,
  dead_stock_value numeric not null default 0,
  units_on_hand bigint not null default 0,
  low_stock_count integer not null default 0,
  open_orders integer not null default 0,
  created_at timestamptz not null default now(),
  -- NULLS NOT DISTINCT so the workspace-wide scope (null warehouse) also
  -- gets exactly one row per day and ON CONFLICT can target it.
  constraint kpi_snapshots_scope_date_key
    unique nulls not distinct (org_id, warehouse_id, snapshot_date)
);

create index if not exists idx_kpi_snapshots_scope_date
  on app.kpi_snapshots (org_id, warehouse_id, snapshot_date desc);

alter table app.kpi_snapshots enable row level security;

-- Members read their org's history; writes come from the capture function
-- (cron, table owner) — no client write path.
create policy kpi_snapshots_select on app.kpi_snapshots
  for select using (app.is_org_member(org_id));

create or replace function app.capture_kpi_snapshots()
returns integer
language sql
security definer
set search_path to ''
as $$
  with scopes as (
    select o.id as org_id, null::uuid as warehouse_id
    from app.orgs o
    where o.deleted_at is null
    union all
    select w.org_id, w.id
    from app.warehouses w
    join app.orgs o on o.id = w.org_id and o.deleted_at is null
    where w.is_active
  ),
  metrics as (
    select
      s.org_id,
      s.warehouse_id,
      f.inventory_value,
      f.dead_stock_value,
      coalesce(u.units, 0) as units_on_hand,
      coalesce(ls.n, 0) as low_stock_count,
      coalesce(oo.n, 0) as open_orders
    from scopes s
    cross join lateral app.overview_financials(s.org_id, s.warehouse_id) f
    left join lateral (
      select sum(l.quantity)::bigint as units
      from app.locations l
      where l.org_id = s.org_id
        and coalesce(l.is_active, true)
        and (s.warehouse_id is null or l.warehouse_id = s.warehouse_id)
    ) u on true
    left join lateral (
      select count(*) as n from (
        select p.id
        from app.products p
        join app.locations l
          on l.product_id = p.id
         and l.org_id = p.org_id
         and coalesce(l.is_active, true)
         and (s.warehouse_id is null or l.warehouse_id = s.warehouse_id)
        where p.org_id = s.org_id
          and coalesce(p.reorder_point, 0) > 0
        group by p.id, p.reorder_point
        having sum(l.quantity) <= p.reorder_point
      ) low
    ) ls on true
    left join lateral (
      select count(*)::integer as n
      from app.orders ord
      where ord.org_id = s.org_id
        and (s.warehouse_id is null or ord.warehouse_id = s.warehouse_id)
        and ord.status::text in
          ('created','pick_list_assigned','in_progress','staged','ready','out_for_delivery')
    ) oo on true
  ),
  written as (
    insert into app.kpi_snapshots
      (org_id, warehouse_id, snapshot_date, inventory_value, dead_stock_value,
       units_on_hand, low_stock_count, open_orders)
    select
      org_id, warehouse_id, current_date, inventory_value, dead_stock_value,
      units_on_hand, low_stock_count, open_orders
    from metrics
    on conflict on constraint kpi_snapshots_scope_date_key
    do update set
      inventory_value  = excluded.inventory_value,
      dead_stock_value = excluded.dead_stock_value,
      units_on_hand    = excluded.units_on_hand,
      low_stock_count  = excluded.low_stock_count,
      open_orders      = excluded.open_orders,
      created_at       = now()
    returning 1
  )
  select count(*)::integer from written;
$$;

revoke all on function app.capture_kpi_snapshots() from public;
revoke all on function app.capture_kpi_snapshots() from anon;
revoke all on function app.capture_kpi_snapshots() from authenticated;
grant execute on function app.capture_kpi_snapshots() to service_role;

-- Nightly at 03:30 UTC — before the 04:00 alert sweeps, direct SQL.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'kpi-snapshots-nightly') then
    perform cron.unschedule('kpi-snapshots-nightly');
  end if;
end $$;

select cron.schedule('kpi-snapshots-nightly', '30 3 * * *',
  'select app.capture_kpi_snapshots();');
