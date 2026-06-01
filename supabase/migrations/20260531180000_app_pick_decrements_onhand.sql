-- Lifecycle fix: picking physically decrements on-hand.
--
-- Until now nothing decremented locations.quantity for a sale — mobile pick only
-- set quantity_picked, so on-hand drifted up forever and ATP had to hold back
-- max(allocated, picked) to compensate. Now a pick decrements the picked-from
-- on-hand in the same atomic step, so on-hand tracks the shelf and ATP reverts to
-- the natural on_hand − Σ max(0, allocated − picked) (unpicked reservation only).
--
-- This migration: the pick RPC + the allocate_order pool revert. A companion
-- migration backfills legacy picked-but-not-decremented units on OPEN orders, and
-- lib/data/allocation.ts reverts the read-side ATP formula to match — they are
-- ONE logical change and must deploy together.

-- ── pick_order_item: atomic pick + on-hand decrement ─────────────────────────
create or replace function app.pick_order_item(
  p_org_id uuid,
  p_order_item_id uuid
) returns jsonb
  language plpgsql
  set search_path to ''
as $$
declare
  v_product_id   uuid;
  v_requested    integer;
  v_picked       integer;
  v_loc_id       uuid;
  v_order_id     uuid;
  v_warehouse_id uuid;
  v_order_number text;
  v_delta        integer;
  v_remaining    integer;
  v_loc          record;
  v_have         integer;
  v_take         integer;
  v_decremented  integer := 0;
  v_from         jsonb := null;
begin
  select oi.product_id, oi.quantity_requested, coalesce(oi.quantity_picked, 0),
         oi.location_id, oi.order_id
    into v_product_id, v_requested, v_picked, v_loc_id, v_order_id
  from app.order_items oi where oi.id = p_order_item_id;
  if not found then
    raise exception 'Order item not found' using errcode = 'no_data_found';
  end if;
  if v_product_id is null then
    raise exception 'Line has no product' using errcode = 'check_violation';
  end if;

  select o.warehouse_id, o.order_number into v_warehouse_id, v_order_number
  from app.orders o where o.id = v_order_id and o.org_id = p_org_id;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;
  if v_warehouse_id is null then
    raise exception 'Order has no facility' using errcode = 'check_violation';
  end if;

  v_delta := v_requested - v_picked;
  if v_delta <= 0 then
    return jsonb_build_object('picked', v_requested, 'decremented', 0, 'noop', true);
  end if;

  -- Lock the product's available on-hand at this facility so concurrent picks
  -- (or a build) can't decrement a stale snapshot.
  perform 1 from app.locations
   where org_id = p_org_id and warehouse_id = v_warehouse_id and product_id = v_product_id
     and is_active = true and quarantined = false
   for update;

  v_remaining := v_delta;
  -- Decrement greedily, preferring the assigned pick slot, then the fullest.
  for v_loc in
    select id, quantity, section_id, bay, level
    from app.locations
    where org_id = p_org_id and warehouse_id = v_warehouse_id and product_id = v_product_id
      and is_active = true and quarantined = false and coalesce(quantity, 0) > 0
    order by (id = v_loc_id) desc, coalesce(quantity, 0) desc
  loop
    exit when v_remaining <= 0;
    v_have := coalesce(v_loc.quantity, 0);
    v_take := least(v_have, v_remaining);
    if v_take <= 0 then continue; end if;
    update app.locations set quantity = v_have - v_take where id = v_loc.id;
    if v_from is null then
      v_from := jsonb_build_object('section_id', v_loc.section_id, 'bay', v_loc.bay, 'level', v_loc.level);
    end if;
    v_remaining := v_remaining - v_take;
    v_decremented := v_decremented + v_take;
  end loop;

  -- Mark the line fully picked even if on-hand couldn't fully cover it (the units
  -- were physically pulled; on-hand floors at 0 rather than going negative).
  update app.order_items
     set quantity_picked = v_requested, picked_by = auth.uid(), picked_at = now()
   where id = p_order_item_id;

  insert into app.scan_history
    (org_id, product_id, warehouse_id, scanned_by, action, from_location, quantity, notes)
  values
    (p_org_id, v_product_id, v_warehouse_id, auth.uid(), 'pick', v_from, v_delta,
     'Order ' || coalesce(v_order_number, left(v_order_id::text, 8)));

  return jsonb_build_object('picked', v_requested, 'decremented', v_decremented);
end;
$$;

-- ── allocate_order: pool holds back only the UNPICKED reservation now ─────────
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
      -- Other open orders' UNPICKED reservation. Picked units have already left
      -- on-hand (decremented at pick), so they no longer hold stock back.
      select coalesce(sum(greatest(0, oi.quantity_allocated - coalesce(oi.quantity_picked, 0))), 0)
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

grant execute on function app.pick_order_item(uuid, uuid) to authenticated, service_role;
