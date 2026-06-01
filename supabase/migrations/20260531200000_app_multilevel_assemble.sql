-- Multi-level kit builds (true BOM explosion).
--
-- Previously assemble_kit consumed only a kit's DIRECT components, so a kit whose
-- components are themselves kits required pre-building each sub-assembly via its
-- own work order. Now assembly is availability-aware and recursive: a component
-- is consumed from on-hand when available (so pre-built sub-assemblies are still
-- used), and any shortfall of a sub-kit is built from ITS components — down to
-- raw leaves. One transaction, serialized per facility, so it's atomic.
--
-- app.consume_for_build(org, wh, product, need, depth, reason): ensure `need`
-- units of `product` are consumed at the facility — greedily from on-hand, and
-- for any shortfall of a kit, recursively from its components. Raises (rolling
-- back the whole build) if a non-kit leaf is short.

create or replace function app.consume_for_build(
  p_org_id uuid,
  p_warehouse_id uuid,
  p_product_id uuid,
  p_need integer,
  p_depth integer,
  p_reason text
) returns void
  language plpgsql
  set search_path to ''
as $$
declare
  v_avail      integer;
  v_from_stock integer;
  v_loc        record;
  v_have       integer;
  v_take       integer;
  v_remaining  integer;
  v_short      integer;
  v_has_comps  integer;
  v_comp       record;
begin
  if p_need <= 0 then return; end if;
  if p_depth > 12 then
    raise exception 'BOM nesting too deep (possible cycle) while building'
      using errcode = 'check_violation';
  end if;

  -- Lock + total this product's available on-hand at the facility.
  perform 1 from app.locations
   where org_id = p_org_id and warehouse_id = p_warehouse_id
     and product_id = p_product_id and is_active = true and quarantined = false
   for update;

  select coalesce(sum(quantity), 0) into v_avail
  from app.locations
  where org_id = p_org_id and warehouse_id = p_warehouse_id
    and product_id = p_product_id and is_active = true and quarantined = false;

  v_from_stock := least(v_avail, p_need);
  if v_from_stock > 0 then
    v_remaining := v_from_stock;
    for v_loc in
      select id, quantity from app.locations
      where org_id = p_org_id and warehouse_id = p_warehouse_id
        and product_id = p_product_id and is_active = true and quarantined = false
        and coalesce(quantity, 0) > 0
      order by coalesce(quantity, 0) desc
    loop
      exit when v_remaining <= 0;
      v_have := coalesce(v_loc.quantity, 0);
      v_take := least(v_have, v_remaining);
      if v_take <= 0 then continue; end if;
      update app.locations set quantity = v_have - v_take where id = v_loc.id;
      v_remaining := v_remaining - v_take;
    end loop;

    insert into app.scan_history
      (org_id, product_id, warehouse_id, scanned_by, action, quantity, notes)
    values
      (p_org_id, p_product_id, p_warehouse_id, auth.uid(), 'adjust',
       -v_from_stock, p_reason || ': consumed from stock');
  end if;

  -- Shortfall: build the rest from this product's components, if it's a kit.
  v_short := p_need - v_from_stock;
  if v_short > 0 then
    select count(*) into v_has_comps
    from app.kit_components
    where org_id = p_org_id and kit_product_id = p_product_id;

    if v_has_comps = 0 then
      raise exception
        'Not enough stock at this facility — short % unit(s) of a component (no bill of materials to build it from)', v_short
        using errcode = 'check_violation';
    end if;

    for v_comp in
      select component_product_id, quantity
      from app.kit_components
      where org_id = p_org_id and kit_product_id = p_product_id
    loop
      perform app.consume_for_build(
        p_org_id, p_warehouse_id, v_comp.component_product_id,
        v_comp.quantity * v_short, p_depth + 1, p_reason
      );
    end loop;

    insert into app.scan_history
      (org_id, product_id, warehouse_id, scanned_by, action, quantity, notes)
    values
      (p_org_id, p_product_id, p_warehouse_id, auth.uid(), 'adjust', 0,
       p_reason || ': sub-assembled ' || v_short || ' (consumed in place)');
  end if;
end;
$$;

grant execute on function app.consume_for_build(uuid, uuid, uuid, integer, integer, text)
  to authenticated, service_role;

-- assemble_kit: produce p_qty of a kit, consuming each DIRECT component via the
-- recursive consume (so sub-assemblies auto-explode). Serialized per facility by
-- an advisory lock so concurrent builds can't read stale on-hand.
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
  v_comp       record;
  v_consumed   jsonb := '{}'::jsonb;
  v_need       integer;
  v_comp_count integer;
  v_kit_loc    uuid;
  v_kit_qty    integer;
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

  -- Serialize assembly at this facility (deadlock-free vs. recursive row locks).
  perform pg_advisory_xact_lock(
    hashtext(p_org_id::text || ':' || p_warehouse_id::text || ':build')
  );

  -- Consume each direct component (recursively building sub-assemblies as needed).
  -- A shortfall with no BOM raises and rolls back the whole transaction.
  for v_comp in
    select component_product_id, quantity
    from app.kit_components
    where org_id = p_org_id and kit_product_id = p_kit_id
  loop
    v_need := v_comp.quantity * p_qty;
    perform app.consume_for_build(
      p_org_id, p_warehouse_id, v_comp.component_product_id, v_need, 1, p_reason
    );
    v_consumed := v_consumed
      || jsonb_build_object(v_comp.component_product_id::text, v_need);
  end loop;

  -- Produce the finished kit into an existing slot or a staging slot.
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
