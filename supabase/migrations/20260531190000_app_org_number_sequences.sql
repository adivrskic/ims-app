-- Atomic per-org document numbering (ORD / PO / WO / WAVE).
--
-- All four numbers were generated with a read-max-then-+1 in app code (and ORD
-- read by created_at, which can mis-pick the latest), so two concurrent creates
-- could mint the same number. Replace with a per-(org,kind) counter incremented
-- atomically in one statement via app.next_document_number.

create table if not exists app.org_number_sequences (
  org_id   uuid not null references app.orgs(id) on delete cascade,
  kind     text not null,                 -- 'ORD' | 'PO' | 'WO' | 'WAVE'
  next_val bigint not null,               -- last number issued for this (org,kind)
  primary key (org_id, kind)
);

alter table app.org_number_sequences enable row level security;
create policy org_number_sequences_rw on app.org_number_sequences
  for all using (app.is_org_member(org_id)) with check (app.is_org_member(org_id));
grant select, insert, update on app.org_number_sequences to authenticated;
grant all on app.org_number_sequences to service_role;

-- Issue the next number for (org, kind), atomically. p_start is the first number
-- to use when this org has no counter yet (preserves the historical ORD-1049 /
-- PO-2049 starting points; WO/WAVE start at 1). p_pad > 0 zero-pads.
create or replace function app.next_document_number(
  p_org_id uuid,
  p_kind   text,
  p_prefix text,
  p_pad    integer,
  p_start  bigint
) returns text
  language plpgsql
  set search_path to ''
as $$
declare
  v bigint;
begin
  insert into app.org_number_sequences (org_id, kind, next_val)
  values (p_org_id, p_kind, p_start)
  on conflict (org_id, kind)
    do update set next_val = app.org_number_sequences.next_val + 1
  returning next_val into v;

  return p_prefix || '-' ||
    case when p_pad > 0 then lpad(v::text, p_pad, '0') else v::text end;
end;
$$;

grant execute on function app.next_document_number(uuid, text, text, integer, bigint)
  to authenticated, service_role;

-- Seed counters from existing data so issued numbers continue past the current
-- max (next_val = last-used number; the first call increments to max+1).
insert into app.org_number_sequences (org_id, kind, next_val)
  select org_id, 'ORD', max((substring(order_number from '^ORD-([0-9]+)$'))::bigint)
  from app.orders where order_number ~ '^ORD-[0-9]+$' group by org_id
on conflict (org_id, kind) do nothing;

insert into app.org_number_sequences (org_id, kind, next_val)
  select org_id, 'PO', max((substring(po_number from '^PO-([0-9]+)$'))::bigint)
  from app.purchase_orders where po_number ~ '^PO-[0-9]+$' group by org_id
on conflict (org_id, kind) do nothing;

insert into app.org_number_sequences (org_id, kind, next_val)
  select org_id, 'WO', max((substring(code from '^WO-([0-9]+)$'))::bigint)
  from app.work_orders where code ~ '^WO-[0-9]+$' group by org_id
on conflict (org_id, kind) do nothing;

insert into app.org_number_sequences (org_id, kind, next_val)
  select org_id, 'WAVE', max((substring(code from '^WAVE-([0-9]+)$'))::bigint)
  from app.pick_waves where code ~ '^WAVE-[0-9]+$' group by org_id
on conflict (org_id, kind) do nothing;
