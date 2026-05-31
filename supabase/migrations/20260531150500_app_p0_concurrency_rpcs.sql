-- P0 concurrency hardening: move stock mutations behind atomic, row-locked
-- (or advisory-locked) plpgsql RPCs so concurrent operations can't read-then-
-- write a stale snapshot. Replaces the untyped client's multi-call read→write
-- patterns in lib/data/{assemble,allocation,adjustments}.ts and
-- work-orders/actions.ts.
--
-- All functions are SECURITY INVOKER (run under the caller's RLS), mirroring
-- app.create_purchase_order. Org scoping is enforced by RLS + the explicit
-- org_id predicates; auth.uid() records the actor.

-- ── assemble_kit ─────────────────────────────────────────────────────────────
-- Consume a kit's DIRECT components from on-hand at a facility and produce the
-- finished good, atomically. Locks every relevant location FOR UPDATE so two
-- concurrent builds (or a build racing a cycle-count) can't both pass the
-- sufficiency check and drive stock negative. Returns the consumed map +
-- produced qty as jsonb. Raises on insufficiency (rolls back the whole call).
create or replace function app.assemble_kit(
  p_org_id uuid,
  p_warehouse_id uuid,
  p_kit_id uuid,
  p_qty integer,
  p_reason text
) returns jsonb
  language plpgsql
  set search_path to ''
as $$
declare
  v_comp        record;
  v_loc         record;
  v_consumed    jsonb := '{}'::jsonb;
  v_need        integer;
  v_remaining   integer;
  v_have        integer;
  v_take        integer;
  v_avail       integer;
  v_comp_count  integer;
  v_kit_loc     uuid;
  v_kit_qty     integer;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be a positive number' using errcode = 'check_violation';
  end if;

  select count(*) into v_comp_count
  from app.kit_components
  where org_id = p_org_id and kit_product_id = p_kit_id;
  if v_comp_count = 0 then
    raise exception 'Define the kit''s bill of materials first' using errcode = 'no_data_found';
  end if;

  -- Lock all relevant location rows (components + finished good) up front so
  -- on-hand can't drift between validation and decrement.
  perform 1
  from app.locations
  where org_id = p_org_id
    and warehouse_id = p_warehouse_id
    and product_id in (
      select component_product_id from app.kit_components
      where org_id = p_org_id and kit_product_id = p_kit_id
      union all
      select p_kit_id
    )
  for update;

  -- Validate sufficiency of every component against live (post-lock) on-hand.
  for v_comp in
    select component_product_id, quantity
    from app.kit_components
    where org_id = p_org_id and kit_product_id = p_kit_id
  loop
    select coalesce(sum(quantity), 0) into v_avail
    from app.locations
    where org_id = p_org_id and warehouse_id = p_warehouse_id
      and product_id = v_comp.component_product_id;
    if v_avail < v_comp.quantity * p_qty then
      raise exception
        'Not enough stock at this facility to build % — short on a component.', p_qty
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Consume components greedily (largest slot first) and audit each leg.
  for v_comp in
    select component_product_id, quantity
    from app.kit_components
    where org_id = p_org_id and kit_product_id = p_kit_id
  loop
    v_need := v_comp.quantity * p_qty;
    v_remaining := v_need;
    for v_loc in
      select id, quantity
      from app.locations
      where org_id = p_org_id and warehouse_id = p_warehouse_id
        and product_id = v_comp.component_product_id
      order by coalesce(quantity, 0) desc
    loop
      exit when v_remaining <= 0;
      v_have := coalesce(v_loc.quantity, 0);
      v_take := least(v_have, v_remaining);
      if v_take <= 0 then continue; end if;
      update app.locations set quantity = v_have - v_take where id = v_loc.id;
      v_remaining := v_remaining - v_take;
    end loop;

    v_consumed := v_consumed
      || jsonb_build_object(v_comp.component_product_id::text, v_need);

    insert into app.scan_history
      (org_id, product_id, warehouse_id, scanned_by, action, quantity, notes)
    values
      (p_org_id, v_comp.component_product_id, p_warehouse_id, auth.uid(),
       'adjust', -v_need, p_reason || ': consumed for ' || p_qty || '× build');
  end loop;

  -- Produce the finished good: bump an existing slot or stage a new one.
  select id, quantity into v_kit_loc, v_kit_qty
  from app.locations
  where org_id = p_org_id and warehouse_id = p_warehouse_id and product_id = p_kit_id
  order by coalesce(quantity, 0) desc
  limit 1;

  if v_kit_loc is not null then
    update app.locations set quantity = coalesce(v_kit_qty, 0) + p_qty where id = v_kit_loc;
  else
    insert into app.locations
      (org_id, product_id, warehouse_id, section_id, bay, level, quantity, placed_by)
    values
      (p_org_id, p_kit_id, p_warehouse_id, null, 0, 0, p_qty, auth.uid());
  end if;

  insert into app.scan_history
    (org_id, product_id, warehouse_id, scanned_by, action, quantity, notes)
  values
    (p_org_id, p_kit_id, p_warehouse_id, auth.uid(), 'adjust', p_qty,
     p_reason || ': assembled ' || p_qty || ' unit' || case when p_qty = 1 then '' else 's' end);

  return jsonb_build_object('consumed', v_consumed, 'produced_qty', p_qty);
end;
$$;

-- ── complete_work_order ──────────────────────────────────────────────────────
-- Atomically claim an open work order (one completer wins the status race),
-- assemble its kit, and record consumed qty on the snapshot lines — all in one
-- transaction. If assembly is short, the exception rolls back the status claim.
create or replace function app.complete_work_order(
  p_org_id uuid,
  p_work_order_id uuid
) returns jsonb
  language plpgsql
  set search_path to ''
as $$
declare
  v_product_id   uuid;
  v_warehouse_id uuid;
  v_quantity     integer;
  v_assembled    jsonb;
  v_consumed     jsonb;
  v_pid          text;
begin
  -- Claim the work order: only an open WO transitions, and only once.
  update app.work_orders
     set status = 'complete', completed_at = now()
   where id = p_work_order_id
     and org_id = p_org_id
     and status in ('draft', 'released', 'in_progress')
  returning product_id, warehouse_id, quantity
       into v_product_id, v_warehouse_id, v_quantity;

  if not found then
    raise exception 'This work order is already closed' using errcode = 'check_violation';
  end if;
  if v_warehouse_id is null then
    raise exception 'Work order has no facility' using errcode = 'check_violation';
  end if;

  v_assembled := app.assemble_kit(
    p_org_id, v_warehouse_id, v_product_id, v_quantity, 'Work order'
  );
  v_consumed := v_assembled -> 'consumed';

  for v_pid in select jsonb_object_keys(v_consumed)
  loop
    update app.work_order_lines
       set quantity_consumed = (v_consumed ->> v_pid)::integer
     where work_order_id = p_work_order_id
       and component_product_id = v_pid::uuid
       and org_id = p_org_id;
  end loop;

  return jsonb_build_object(
    'quantity', v_quantity,
    'product_id', v_product_id,
    'consumed', v_consumed
  );
end;
$$;

-- ── allocate_order ───────────────────────────────────────────────────────────
-- (Re)allocate one order against current availability under a per-facility
-- advisory lock, so two orders for the same SKU can't each subtract the same
-- ATP and oversell. Free pool per product = on-hand(active) minus OTHER open
-- orders' unpicked reservations (equivalent to ATP + this order's own unpicked).
-- Greedy per line; never drops below picked, never exceeds requested.
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

  -- Serialize allocations within this facility for the rest of the txn.
  perform pg_advisory_xact_lock(
    hashtext(p_org_id::text || ':' || v_warehouse_id::text)
  );

  -- Free pool per product this order touches: on-hand minus OTHER open orders'
  -- unpicked reservations in the same facility.
  for v_prod in
    select distinct product_id
    from app.order_items
    where order_id = p_order_id and product_id is not null
  loop
    v_pool := (
      select coalesce(sum(quantity), 0)
      from app.locations
      where org_id = p_org_id and warehouse_id = v_warehouse_id
        and is_active = true and product_id = v_prod.product_id
    ) - (
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

  -- Greedy allocation, deterministic line order.
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

-- ── commit_stock_adjustment ──────────────────────────────────────────────────
-- Apply a manual stock adjustment to an absolute target qty, guarded against
-- lost updates: only writes if on-hand still matches what the requester saw.
-- Returns {applied:true} on success, or {applied:false, currentQty:<live>} when
-- stock drifted (caller surfaces a "refresh and retry" message).
create or replace function app.commit_stock_adjustment(
  p_org_id uuid,
  p_location_id uuid,
  p_warehouse_id uuid,
  p_product_id uuid,
  p_current_qty integer,
  p_requested_qty integer,
  p_reason_code text,
  p_notes text
) returns jsonb
  language plpgsql
  set search_path to ''
as $$
declare
  v_delta  integer := p_requested_qty - p_current_qty;
  v_actual integer;
begin
  update app.locations
     set quantity = p_requested_qty
   where id = p_location_id
     and org_id = p_org_id
     and coalesce(quantity, 0) = p_current_qty;

  if not found then
    select coalesce(quantity, 0) into v_actual
    from app.locations where id = p_location_id and org_id = p_org_id;
    return jsonb_build_object('applied', false, 'currentQty', v_actual);
  end if;

  insert into app.scan_history
    (org_id, product_id, warehouse_id, scanned_by, action, quantity, reason_code, notes)
  values
    (p_org_id, p_product_id, p_warehouse_id, auth.uid(), 'adjust', v_delta,
     p_reason_code, p_notes);

  return jsonb_build_object('applied', true);
end;
$$;

grant execute on function
  app.assemble_kit(uuid, uuid, uuid, integer, text),
  app.complete_work_order(uuid, uuid),
  app.allocate_order(uuid, uuid),
  app.commit_stock_adjustment(uuid, uuid, uuid, uuid, integer, integer, text, text)
to authenticated, service_role;
