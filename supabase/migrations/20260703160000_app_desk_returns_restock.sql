-- Desk-side RMA depth: create returns from an order + restock accepted returns.
--
-- Two gaps closed:
--   1. Returns could only be LOGGED at the receiving dock (mobile app). The
--      desk now creates them from an order's line items, so we add
--      order_item_id to tie a return to the specific line it came from
--      (returns already had order_id, but not the line).
--   2. The desk review was sign-off only — "restock" was a disposition label,
--      nothing ever credited stock back. app.restock_return is the atomic
--      credit: under a lock on the return row (double-submit guard) and the
--      destination location row, it increments on-hand, writes the
--      scan_history 'return' audit row, and stamps the return restocked —
--      one transaction, mirroring app.record_cycle_count's shape.
--
-- Like record_cycle_count this is an INVOKER-rights function with an empty
-- search_path and fully-qualified references: RLS (returns_write /
-- locations / scan_history member policies) still applies to every read and
-- write inside, and the function additionally pins org_id explicitly on each
-- statement. Grants match record_cycle_count exactly.

-- ── Columns ────────────────────────────────────────────────────────────────

alter table app.returns
  add column if not exists order_item_id uuid references app.order_items(id) on delete set null,
  add column if not exists restocked_at timestamptz,
  add column if not exists restocked_by uuid,
  add column if not exists restock_location_id uuid references app.locations(id) on delete set null;

comment on column app.returns.order_item_id is
  'Order line this return was created from (desk create-return flow). Null for dock-logged returns.';
comment on column app.returns.restocked_at is
  'When the return was credited back to on-hand via app.restock_return. Null = not (yet) restocked.';
comment on column app.returns.restocked_by is
  'Profile/user id who executed the restock at the desk.';
comment on column app.returns.restock_location_id is
  'Destination location the returned units were credited to.';

-- The desk create-return action sums prior returns per order line to cap the
-- returnable quantity.
create index if not exists returns_order_item_id_idx
  on app.returns (order_item_id)
  where order_item_id is not null;

-- ── RPC: atomic restock of an accepted return ──────────────────────────────

create or replace function app.restock_return(
  p_org_id uuid,
  p_return_id uuid,
  p_location_id uuid,
  p_qty integer,
  p_by uuid
) returns jsonb
  language plpgsql
  set search_path to ''
as $$
declare
  v_ret     record;
  v_loc     record;
  v_new_qty integer;
begin
  if p_qty is null or p_qty <= 0 then
    return jsonb_build_object('error', 'invalid_qty');
  end if;

  -- Lock the return row FIRST so two concurrent restocks of the same return
  -- serialize here — the loser sees restocked_at set and bails.
  select id, product_id, warehouse_id, quantity, disposition,
         reviewed_at, restocked_at
    into v_ret
  from app.returns
  where id = p_return_id and org_id = p_org_id
  for update;

  if not found then
    return jsonb_build_object('error', 'return_not_found');
  end if;
  if v_ret.restocked_at is not null then
    return jsonb_build_object('error', 'already_restocked');
  end if;
  -- Restockable = reviewed (desk sign-off happened) with disposition 'restock'.
  if v_ret.reviewed_at is null or v_ret.disposition <> 'restock' then
    return jsonb_build_object('error', 'not_restockable');
  end if;
  if v_ret.product_id is null then
    return jsonb_build_object('error', 'no_product');
  end if;
  if p_qty > v_ret.quantity then
    return jsonb_build_object('error', 'invalid_qty');
  end if;

  -- Lock the destination location so the read-of-quantity + write are one
  -- race-free unit (same shape as app.record_cycle_count).
  select id, product_id, warehouse_id, quarantined,
         coalesce(is_active, true) as is_active,
         coalesce(quantity, 0) as quantity
    into v_loc
  from app.locations
  where id = p_location_id and org_id = p_org_id
  for update;

  if not found then
    return jsonb_build_object('error', 'location_not_found');
  end if;
  if v_loc.quarantined or not v_loc.is_active then
    return jsonb_build_object('error', 'location_unavailable');
  end if;
  -- If the return was logged against a facility, credit stock at that facility.
  if v_ret.warehouse_id is not null
     and v_loc.warehouse_id is distinct from v_ret.warehouse_id then
    return jsonb_build_object('error', 'warehouse_mismatch');
  end if;
  -- Destination must hold this product, or be empty (we claim it below).
  if v_loc.product_id is not null and v_loc.product_id <> v_ret.product_id then
    return jsonb_build_object('error', 'location_holds_other_product');
  end if;

  if v_loc.product_id is null then
    v_new_qty := p_qty;
    update app.locations
       set product_id = v_ret.product_id,
           quantity   = v_new_qty,
           updated_at = now()
     where id = p_location_id and org_id = p_org_id;
  else
    v_new_qty := v_loc.quantity + p_qty;
    update app.locations
       set quantity   = v_new_qty,
           updated_at = now()
     where id = p_location_id and org_id = p_org_id;
  end if;

  -- Audit inside the same transaction.
  insert into app.scan_history
    (org_id, product_id, warehouse_id, scanned_by, action, quantity, notes)
  values
    (p_org_id, v_ret.product_id, v_loc.warehouse_id, p_by, 'return', p_qty,
     'Return restocked to inventory'
       || case when p_qty < v_ret.quantity
               then format(' (partial: %s of %s)', p_qty, v_ret.quantity)
               else '' end);

  update app.returns
     set restocked_at        = now(),
         restocked_by        = p_by,
         restock_location_id = p_location_id
   where id = p_return_id and org_id = p_org_id;

  return jsonb_build_object(
    'ok', true,
    'returnId', v_ret.id,
    'productId', v_ret.product_id,
    'locationId', p_location_id,
    'quantity', p_qty,
    'newLocationQty', v_new_qty
  );
end;
$$;

revoke all on function app.restock_return(uuid, uuid, uuid, integer, uuid) from public;
grant execute on function app.restock_return(uuid, uuid, uuid, integer, uuid) to authenticated, service_role;
