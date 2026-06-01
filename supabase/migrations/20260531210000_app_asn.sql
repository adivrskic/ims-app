-- Receiving depth: Advance Ship Notices (ASN) + License Plate / handling-unit
-- (LPN) grouping. An ASN is a supplier's heads-up of an inbound shipment — what's
-- coming, when, optionally against a PO — so receivers can reconcile against
-- expectations and receive a whole pallet (LPN) in one action.

create table if not exists app.asns (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references app.orgs(id) on delete cascade,
  asn_number      text not null,
  reference       text,                                  -- supplier's own ASN #
  supplier_id     uuid references app.suppliers(id) on delete set null,
  po_id           uuid references app.purchase_orders(id) on delete set null,
  warehouse_id    uuid references app.warehouses(id) on delete set null,
  status          text not null default 'expected'
                    check (status in ('expected','in_transit','received','cancelled')),
  carrier         text,
  tracking_number text,
  expected_date   date,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  received_at     timestamptz
);

create table if not exists app.asn_lines (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references app.orgs(id) on delete cascade,
  asn_id            uuid not null references app.asns(id) on delete cascade,
  po_line_id        uuid references app.po_line_items(id) on delete set null,
  product_id        uuid references app.products(id) on delete set null,
  product_name      text,
  lpn               text,                                -- handling-unit / pallet code
  quantity_expected integer not null,
  quantity_received integer not null default 0,
  lot_number        text
);

create index if not exists asns_org_status_idx on app.asns (org_id, status, expected_date);
create index if not exists asns_po_idx on app.asns (po_id) where po_id is not null;
create index if not exists asn_lines_asn_idx on app.asn_lines (asn_id);
create index if not exists asn_lines_lpn_idx on app.asn_lines (org_id, lpn) where lpn is not null;

alter table app.asns enable row level security;
alter table app.asn_lines enable row level security;

create policy asns_rw on app.asns
  for all using (app.is_org_member(org_id)) with check (app.is_org_member(org_id));
create policy asn_lines_rw on app.asn_lines
  for all using (app.is_org_member(org_id)) with check (app.is_org_member(org_id));

grant select, insert, update, delete on app.asns to authenticated;
grant select, insert, update, delete on app.asn_lines to authenticated;
grant all on app.asns to service_role;
grant all on app.asn_lines to service_role;
