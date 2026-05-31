-- Work orders: tracked assembly of a kit / finished good from its BOM.
-- Lines snapshot the kit's bill of materials at creation; completion consumes
-- components and produces the finished good (shared with the quick buildKit path).

create table if not exists app.work_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.orgs(id) on delete cascade,
  warehouse_id uuid references app.warehouses(id) on delete set null,
  product_id uuid not null references app.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  code text not null,
  status text not null default 'draft'
    check (status in ('draft','released','in_progress','complete','cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists app.work_order_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.orgs(id) on delete cascade,
  work_order_id uuid not null references app.work_orders(id) on delete cascade,
  component_product_id uuid not null references app.products(id) on delete restrict,
  quantity_required integer not null check (quantity_required >= 0),
  quantity_consumed integer not null default 0
);

create index if not exists work_orders_org_wh_idx
  on app.work_orders (org_id, warehouse_id, created_at desc);
create index if not exists work_orders_product_idx
  on app.work_orders (product_id);
create index if not exists work_order_lines_wo_idx
  on app.work_order_lines (work_order_id);

alter table app.work_orders enable row level security;
alter table app.work_order_lines enable row level security;

create policy work_orders_select on app.work_orders
  for select using (app.is_org_member(org_id));
create policy work_orders_write on app.work_orders
  for all using (app.is_org_member(org_id)) with check (app.is_org_member(org_id));
create policy work_order_lines_select on app.work_order_lines
  for select using (app.is_org_member(org_id));
create policy work_order_lines_write on app.work_order_lines
  for all using (app.is_org_member(org_id)) with check (app.is_org_member(org_id));

grant select, insert, update, delete on app.work_orders to authenticated;
grant select, insert, update, delete on app.work_order_lines to authenticated;
grant all on app.work_orders to service_role;
grant all on app.work_order_lines to service_role;

comment on table app.work_orders is
  'Tracked assembly of a kit/finished good from its BOM. Completion consumes direct components and produces the finished good.';
