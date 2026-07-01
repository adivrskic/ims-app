-- Allocation correctness: the write-side free-pool in app.allocate_order summed
-- on-hand with `is_active = true` but did NOT exclude quarantined locations,
-- while the read-side ATP (lib/data/allocation.ts, app.stock_availability, and
-- app.fill_backorders) all treat QC-held stock as unavailable. That mismatch let
-- allocation reserve against quarantined units — promising stock that can't ship.
--
-- Add `and quarantined = false` to the on-hand subquery so the write side matches
-- the read side. Everything else is unchanged from the committed-pool version.

create or replace function app.allocate_order(
  p_org_id uuid,
  p_order_id uuid
) returns jsonb
  language plpgsql
  set search_path to ''
as $$
declare
  v_warehouse_id uuid;
  v_status       text;
  v_open         text[] := array[
    'created','pick_list_assigned','in_progress','staged','ready','out_for_delivery'
  ];
  v_pool_map     jsonb := '{}'::jsonb;
  v_prod         record;
  v_line         record;
  v_pool         integer;
  v_take         integer;
  v_new          integer;
  v_changed      integer := 0;
  v_requested    integer := 0;
  v_allocated    integer := 0;
  v_backordered  integer := 0;
begin
  select warehouse_id, status::text into v_warehouse_id, v_status
  from app.orders where id = p_order_id and org_id = p_org_id;

  if not found then
    return jsonb_build_object('skipped', true, 'reason', 'not found');
  end if;
  if v_warehouse_id is null then
    return jsonb_build_object('skipped', true, 'reason', 'no facility');
  end if;
  if not (v_status = any(v_open)) then
    return jsonb_build_object('skipped', true, 'reason', 'not open');
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_org_id::text || ':' || v_warehouse_id::text)
  );

  -- Free pool per product = on-hand (active, NON-quarantined) minus OTHER open
  -- orders' committed units (max(allocated, picked)). This order's own
  -- commitment is excluded so re-allocation doesn't fight itself.
  for v_prod in
    select distinct product_id
    from app.order_items
    where order_id = p_order_id and product_id is not null
  loop
    v_pool := (
      select coalesce(sum(quantity), 0)
      from app.locations
      where org_id = p_org_id and warehouse_id = v_warehouse_id
        and is_active = true and quarantined = false
        and product_id = v_prod.product_id
    ) - (
      select coalesce(sum(greatest(oi.quantity_allocated, coalesce(oi.quantity_picked, 0))), 0)
      from app.order_items oi
      join app.orders o on o.id = oi.order_id
      where o.org_id = p_org_id and o.warehouse_id = v_warehouse_id
        and o.status::text = any(v_open)
        and oi.order_id <> p_order_id
        and oi.product_id = v_prod.product_id
    );
    v_pool_map := v_pool_map
      || jsonb_build_object(v_prod.product_id::text, greatest(0, v_pool));
  end loop;

  for v_line in
    select id, product_id, quantity_requested, quantity_allocated,
           coalesce(quantity_picked, 0) as picked
    from app.order_items
    where order_id = p_order_id and product_id is not null
    order by id
  loop
    v_pool := coalesce((v_pool_map ->> v_line.product_id::text)::integer, 0);
    v_take := least(greatest(0, v_line.quantity_requested - v_line.picked), v_pool);
    v_new  := v_line.picked + v_take;
    v_pool_map := v_pool_map
      || jsonb_build_object(v_line.product_id::text, greatest(0, v_pool - v_take));

    if v_new <> v_line.quantity_allocated then
      update app.order_items set quantity_allocated = v_new where id = v_line.id;
      v_changed := v_changed + 1;
    end if;

    v_requested   := v_requested + v_line.quantity_requested;
    v_allocated   := v_allocated + v_new;
    v_backordered := v_backordered + greatest(0, v_line.quantity_requested - v_new);
  end loop;

  return jsonb_build_object(
    'skipped', false,
    'changedLines', v_changed,
    'requestedUnits', v_requested,
    'allocatedUnits', v_allocated,
    'backorderedUnits', v_backordered,
    'fullyAllocated', v_backordered = 0
  );
end;
$$;
