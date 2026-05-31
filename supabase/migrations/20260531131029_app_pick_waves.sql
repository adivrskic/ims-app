-- Wave / zone picking. A wave batches orders into one optimized picking trip.
-- Desk plans + sequences; mobile still scan-picks. Sequence-only — we don't
-- write order_items.location_id (mobile/FEFO owns the physical pick-from slot).

create table if not exists app.pick_waves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.orgs(id) on delete cascade,
  warehouse_id uuid references app.warehouses(id) on delete set null,
  code text not null,
  status text not null default 'planned',
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  constraint pick_waves_status_check
    check (status in ('planned','released','complete','cancelled'))
);

create index if not exists pick_waves_org_wh_idx
  on app.pick_waves (org_id, warehouse_id, created_at desc);

alter table app.pick_waves enable row level security;

create policy pick_waves_select on app.pick_waves
  for select using (app.is_org_member(org_id));
create policy pick_waves_write on app.pick_waves
  for all using (app.is_org_member(org_id))
  with check (app.is_org_member(org_id));

grant select, insert, update, delete on app.pick_waves to authenticated;
grant all on app.pick_waves to service_role;

-- An order belongs to at most one wave at a time.
alter table app.orders
  add column if not exists pick_wave_id uuid
  references app.pick_waves(id) on delete set null;
create index if not exists orders_pick_wave_idx on app.orders (pick_wave_id);

-- Optional zone grouping for sections (null = the section is its own zone).
alter table app.sections add column if not exists pick_zone text;

comment on table app.pick_waves is
  'Wave/zone picking: a batch of orders picked together. Sequence/planning layer; physical picking stays on mobile.';
comment on column app.sections.pick_zone is
  'Optional zone label grouping sections for zone picking. NULL = section is its own zone.';
