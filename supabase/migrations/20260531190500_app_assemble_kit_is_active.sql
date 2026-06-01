-- P2: assemble_kit's on-hand reads filtered quarantined but not is_active, so a
-- soft-deleted (removed) location could still be consumed or topped up. Add
-- `is_active = true` to every locations read, consistent with allocation/picking/
-- work-order availability.
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
    and is_active = true and quarantined = false
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
      and is_active = true and quarantined = false
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
        and is_active = true and quarantined = false
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
    and product_id = p_kit_id and is_active = true and quarantined = false
  order by coalesce(quantity, 0) desc
  limit 1;

  if v_kit_loc is not null then
    update app.locations set quantity = coalesce(v_kit_qty, 0) + p_qty where id = v_kit_loc;
  else
    insert into app.locations
      (org_id, product_id, warehouse_id, section_id, bay, level, quantity, placed_by)
    values
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
