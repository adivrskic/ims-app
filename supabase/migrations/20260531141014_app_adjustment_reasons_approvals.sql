-- Inventory control: structured adjustment reason codes + an approval queue
-- for large manual adjustments.

create table if not exists app.adjustment_reasons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.orgs(id) on delete cascade,
  code text not null,
  label text not null,
  requires_approval boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists app.stock_adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.orgs(id) on delete cascade,
  warehouse_id uuid references app.warehouses(id) on delete set null,
  location_id uuid references app.locations(id) on delete set null,
  product_id uuid references app.products(id) on delete set null,
  current_qty integer not null,
  requested_qty integer not null,
  delta integer not null,
  reason_code text,
  notes text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists adjustment_reasons_org_idx
  on app.adjustment_reasons (org_id, sort_order);
create index if not exists stock_adj_req_pending_idx
  on app.stock_adjustment_requests (org_id, status, created_at desc);

-- Denormalized reason on the audit trail + counts for reporting.
alter table app.scan_history add column if not exists reason_code text;
alter table app.cycle_counts add column if not exists reason_code text;

-- Org-level approval threshold (abs delta). NULL = approvals off.
alter table app.orgs add column if not exists adjustment_approval_threshold integer;

alter table app.adjustment_reasons enable row level security;
alter table app.stock_adjustment_requests enable row level security;

create policy adjustment_reasons_select on app.adjustment_reasons
  for select using (app.is_org_member(org_id));
create policy adjustment_reasons_write on app.adjustment_reasons
  for all using (app.is_org_member(org_id)) with check (app.is_org_member(org_id));
create policy stock_adj_req_select on app.stock_adjustment_requests
  for select using (app.is_org_member(org_id));
create policy stock_adj_req_write on app.stock_adjustment_requests
  for all using (app.is_org_member(org_id)) with check (app.is_org_member(org_id));

grant select, insert, update, delete on app.adjustment_reasons to authenticated;
grant select, insert, update, delete on app.stock_adjustment_requests to authenticated;
grant all on app.adjustment_reasons to service_role;
grant all on app.stock_adjustment_requests to service_role;
