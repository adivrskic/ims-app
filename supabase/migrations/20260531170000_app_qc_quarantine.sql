-- QC real quarantine: received-with-hold goods land in a quarantined on-hand
-- state — still owned (so they count in valuation / inventory totals) but NOT
-- available (excluded from ATP, pick slots, kit assembly, allocation). QC pass
-- clears the flag (releases to available); QC fail deactivates the row (flagged
-- for vendor return). Quarantine locations are linked to the originating PO line
-- so review can release/remove exactly the right units.

alter table app.locations
  add column if not exists quarantined boolean not null default false,
  add column if not exists po_line_id uuid references app.po_line_items(id) on delete set null;

create index if not exists locations_quarantined_idx
  on app.locations (org_id, product_id) where quarantined;

-- ── assemble_kit: never consume or count quarantined stock ───────────────────
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

  perform 1
  from app.locations
  where org_id = p_org_id
    and warehouse_id = p_warehouse_id
    and quarantined = false
    and product_id in (
      select component_product_id from app.kit_components
      where org_id = p_org_id and kit_product_id = p_kit_id
      union all
      select p_kit_id
    )
  for update;

  for v_comp in
    select component_product_id, quantity
    from app.kit_components
    where org_id = p_org_id and kit_product_id = p_kit_id
  loop
    select coalesce(sum(quantity), 0) into v_avail
    from app.locations
    where org_id = p_org_id and warehouse_id = p_warehouse_id
      and quarantined = false
      and product_id = v_comp.component_product_id;
    if v_avail < v_comp.quantity * p_qty then
      raise exception
        'Not enough stock at this facility to build % — short on a component.', p_qty
        using errcode = 'check_violation';
    end if;
  end loop;

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
        and quarantined = false
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

  select id, quantity into v_kit_loc, v_kit_qty
  from app.locations
  where org_id = p_org_id and warehouse_id = p_warehouse_id
    and product_id = p_kit_id and quarantined = false
  order by coalesce(quantity, 0) desc
  limit 1;

  if v_kit_loc is not null then
    update app.locations set quantity = coalesce(v_kit_qty, 0) + p_qty where id = v_kit_loc;
  else
    insert into app.locations
      (org_id, product_id, warehouse_id, section_id, bay, level, quantity, placed_by)
    values
      -- bay/level = 1: a staging slot. locations_{bay,level}_check require > 0.
      (p_org_id, p_kit_id, p_warehouse_id, null, 1, 1, p_qty, auth.uid());
  end if;

  insert into app.scan_history
    (org_id, product_id, warehouse_id, scanned_by, action, quantity, notes)
  values
    (p_org_id, p_kit_id, p_warehouse_id, auth.uid(), 'adjust', p_qty,
     p_reason || ': assembled ' || p_qty || ' unit' || case when p_qty = 1 then '' else 's' end);

  return jsonb_build_object('consumed', v_consumed, 'produced_qty', p_qty);
end;
$$;

-- ── allocate_order: free pool excludes quarantined on-hand ───────────────────
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
