-- ASN receiving: atomic line receipt, and a real lot link (2026-09-12).
--
-- Two defects, both in the same write path, both fixed here because they can
-- only be fixed together — the lot id has nowhere to go until the column
-- exists, and writing it from application code re-opens the race below.
--
-- 1. LOST UPDATE ACROSS SURFACES. Receiving an ASN line incremented
--    app.po_line_items.quantity_received with a read-then-write in application
--    code. The ASN side had an optimistic lock, but the PO line did not, so an
--    ASN receive racing a receipt on the PO detail page would both read the
--    same quantity, both add, and one increment would vanish. The PO then
--    under-reports what arrived, and its status can settle on
--    `partially_received` for goods that are fully on the dock.
--
--    Fixing it in application code is not possible without leaving the ASN
--    line incremented while the PO line is not — they have to move together.
--    This function takes both rows FOR UPDATE and writes them in one
--    transaction, so a concurrent receipt waits and then sees a true remaining.
--
-- 2. NO LOT LINKAGE ON A STANDALONE ASN LINE. app.asn_lines carried a
--    free-text lot_number but no lot_id, so an ASN not raised from a PO could
--    create the app.lots row and still leave nothing pointing at it — the Lots
--    registry, FEFO picking and expiry alerts all read the id. PO-linked lines
--    were fine only because the id could be parked on the PO line instead.

alter table app.asn_lines
  add column if not exists lot_id uuid references app.lots(id) on delete set null;

create index if not exists asn_lines_lot_idx
  on app.asn_lines (lot_id) where lot_id is not null;

comment on column app.asn_lines.lot_id is
  'Resolved app.lots row for this line''s lot_number. Set on receipt by app.receive_asn_line.';

-- Receive one ASN line, reconciling the linked PO line in the same transaction.
--
-- p_qty null means "all remaining" (the whole-pallet path, which has no
-- user-supplied number to get wrong). A quantity over what is left raises
-- `over_receipt:<remaining>`; because the caller validates the typo case before
-- it starts, that error reaching the caller means the remaining changed
-- underneath it — i.e. a concurrent receipt — which is reported as such.
--
-- SECURITY INVOKER: runs under the caller's RLS, so a spoofed p_org can only
-- ever touch rows the caller could already write. Matches app.assemble_kit and
-- app.commit_stock_adjustment.
create or replace function app.receive_asn_line(
  p_org        uuid,
  p_line_id    uuid,
  p_qty        integer default null,
  p_lot_id     uuid    default null,
  p_lot_number text    default null
) returns jsonb
  language plpgsql
  security invoker
  set search_path to ''
as $$
declare
  v_line  record;
  v_rem   integer;
  v_qty   integer;
  v_po_id uuid;
begin
  select
    l.id,
    l.po_line_id,
    l.product_id,
    l.quantity_expected,
    coalesce(l.quantity_received, 0) as received
  into v_line
  from app.asn_lines l
  where l.id = p_line_id and l.org_id = p_org
  for update;

  if not found then
    raise exception 'asn_line_not_found' using errcode = 'no_data_found';
  end if;

  v_rem := v_line.quantity_expected - v_line.received;
  -- Nothing left on this line: not an error, just nothing to do. The pallet
  -- path relies on this to skip lines a previous receipt already closed.
  if v_rem <= 0 then
    return jsonb_build_object('received', 0, 'skipped', true);
  end if;

  v_qty := coalesce(p_qty, v_rem);
  if v_qty <= 0 then
    raise exception 'invalid_qty' using errcode = 'check_violation';
  end if;
  if v_qty > v_rem then
    raise exception 'over_receipt:%', v_rem using errcode = 'check_violation';
  end if;

  update app.asn_lines
  set
    quantity_received = v_line.received + v_qty,
    -- coalesce, never clear: a later receipt with no lot must not wipe an
    -- earlier one's linkage.
    lot_id     = coalesce(p_lot_id, lot_id),
    lot_number = coalesce(nullif(p_lot_number, ''), lot_number)
  where id = p_line_id;

  if v_line.po_line_id is not null then
    -- Lock before read-modify-write. This is the half that was missing.
    perform 1 from app.po_line_items where id = v_line.po_line_id for update;

    update app.po_line_items
    set
      quantity_received = coalesce(quantity_received, 0) + v_qty,
      received_at       = now(),
      received_by       = auth.uid(),
      lot_id            = coalesce(p_lot_id, lot_id),
      lot_number        = coalesce(nullif(p_lot_number, ''), lot_number)
    where id = v_line.po_line_id
    returning po_id into v_po_id;
  end if;

  return jsonb_build_object(
    'received',   v_qty,
    'po_id',      v_po_id,
    'product_id', v_line.product_id,
    'skipped',    false
  );
end;
$$;

revoke all on function app.receive_asn_line(uuid, uuid, integer, uuid, text) from public;
revoke all on function app.receive_asn_line(uuid, uuid, integer, uuid, text) from anon;
grant execute on function app.receive_asn_line(uuid, uuid, integer, uuid, text)
  to authenticated, service_role;
