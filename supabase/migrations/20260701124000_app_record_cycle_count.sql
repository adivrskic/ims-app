-- M3 fix: make a cycle count and its stock correction atomic.
--
-- Previously the action did three separate, non-transactional steps: insert the
-- cycle_counts row, then call the adjustment path, then flip status='adjusted'.
-- A crash between them left the count row and on-hand diverged (a variance
-- recorded with no correction, or vice-versa).
--
-- This RPC does it all in ONE transaction, under a row lock on the location so
-- the read-of-expected and the write are a single race-free unit (which is
-- exactly the "count against the live baseline" semantics the feature wants).
--
-- Governance stays a single source of truth in TS: the caller computes
-- p_needs_approval via lib/data/adjustments.ts (adjustmentNeedsApproval) and
-- passes it in — this RPC only executes the resulting write, it does not decide
-- policy. The commit branch mirrors app.commit_stock_adjustment's write shape
-- (locations update + scan_history 'adjust' row); the queue branch inserts a
-- stock_adjustment_request and leaves the count 'recorded'.

create or replace function app.record_cycle_count(
  p_org_id uuid,
  p_location_id uuid,
  p_product_id uuid,
  p_counted_qty integer,
  p_notes text,
  p_reason_code text,
  p_counted_by uuid,
  p_needs_approval boolean
) returns jsonb
  language plpgsql
  set search_path to ''
as $$
declare
  v_loc          record;
  v_expected     integer;
  v_variance     integer;
  v_count_id     uuid;
  v_adjust_notes text;
begin
  -- Lock the location so read-of-expected + write are one race-free unit.
  select id, product_id, warehouse_id, coalesce(quantity, 0) as quantity
    into v_loc
  from app.locations
  where id = p_location_id and org_id = p_org_id
  for update;

  if not found then
    return jsonb_build_object('error', 'location_not_found');
  end if;
  if v_loc.product_id is distinct from p_product_id then
    return jsonb_build_object('error', 'product_mismatch');
  end if;

  v_expected := v_loc.quantity;
  v_variance := p_counted_qty - v_expected;
  v_adjust_notes := case
    when coalesce(p_notes, '') <> '' then 'Cycle count adjustment: ' || p_notes
    else 'Cycle count adjustment'
  end;

  -- Record the count (variance is a generated column; status defaults 'recorded').
  insert into app.cycle_counts
    (org_id, product_id, location_id, warehouse_id,
     expected_qty, counted_qty, notes, reason_code, counted_by)
  values
    (p_org_id, p_product_id, p_location_id, v_loc.warehouse_id,
     v_expected, p_counted_qty, nullif(p_notes, ''), p_reason_code, p_counted_by)
  returning id into v_count_id;

  if v_variance = 0 then
    return jsonb_build_object('countId', v_count_id, 'outcome', 'no_variance',
                             'variance', 0, 'expected', v_expected);
  end if;

  if p_needs_approval then
    insert into app.stock_adjustment_requests
      (org_id, warehouse_id, location_id, product_id,
       current_qty, requested_qty, delta, reason_code, notes, requested_by)
    values
      (p_org_id, v_loc.warehouse_id, p_location_id, p_product_id,
       v_expected, p_counted_qty, v_variance, p_reason_code, v_adjust_notes, p_counted_by);
    -- count stays 'recorded'; the adjustment is pending an admin's decision.
    return jsonb_build_object('countId', v_count_id, 'outcome', 'queued',
                             'variance', v_variance, 'expected', v_expected);
  end if;

  -- Commit: correct on-hand, write the adjust audit, mark the count adjusted.
  update app.locations set quantity = p_counted_qty
   where id = p_location_id and org_id = p_org_id;

  insert into app.scan_history
    (org_id, product_id, warehouse_id, scanned_by, action, quantity, reason_code, notes)
  values
    (p_org_id, p_product_id, v_loc.warehouse_id, p_counted_by, 'adjust', v_variance,
     p_reason_code, v_adjust_notes);

  update app.cycle_counts set status = 'adjusted' where id = v_count_id;

  return jsonb_build_object('countId', v_count_id, 'outcome', 'committed',
                           'variance', v_variance, 'expected', v_expected);
end;
$$;

revoke all on function app.record_cycle_count(uuid, uuid, uuid, integer, text, text, uuid, boolean) from public;
grant execute on function app.record_cycle_count(uuid, uuid, uuid, integer, text, text, uuid, boolean) to authenticated, service_role;
