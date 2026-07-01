-- M2 fix: make backorder-fill atomic and race-free.
--
-- fillBackordersInternal() read ATP once, then looped per-line UPDATEs in JS with
-- NO lock and NO re-check. Two concurrent fills (or a concurrent allocation/pick)
-- both saw the same pool and each allocated it → total allocated exceeds on-hand
-- (oversell). It also wrote `quantity_allocated = <stale snapshot> + take`, so a
-- concurrent change to the line was silently clobbered.
--
-- This RPC mirrors app.allocate_order: it takes the SAME per-facility advisory
-- lock (hashtext(org:warehouse)), computes ATP INSIDE the lock, and issues
-- column-relative UPDATEs (quantity_allocated = quantity_allocated + take) so no
-- stale snapshot can clobber a concurrent write. ATP contract matches the read
-- side: on_hand(active, non-quarantined) − Σ max(0, allocated − picked) over open
-- orders for this product+facility.

create or replace function app.fill_backorders(
  p_org_id uuid,
  p_warehouse_id uuid,
  p_product_id uuid
) returns jsonb
  language plpgsql
  set search_path to ''
as $$
declare
  v_open text[] := array[
    'created','pick_list_assigned','in_progress','staged','ready','out_for_delivery'
  ];
  v_on_hand      integer;
  v_reserved     integer;
  v_pool         integer;
  v_take         integer;
  v_line         record;
  v_filled_units integer := 0;
  v_filled_lines integer := 0;
  v_orders       uuid[]  := array[]::uuid[];
begin
  perform pg_advisory_xact_lock(
    hashtext(p_org_id::text || ':' || p_warehouse_id::text)
  );

  select coalesce(sum(quantity), 0) into v_on_hand
  from app.locations
  where org_id = p_org_id and warehouse_id = p_warehouse_id
    and is_active = true and quarantined = false and product_id = p_product_id;

  select coalesce(sum(greatest(0, oi.quantity_allocated - coalesce(oi.quantity_picked, 0))), 0)
    into v_reserved
  from app.order_items oi
  join app.orders o on o.id = oi.order_id
  where o.org_id = p_org_id and o.warehouse_id = p_warehouse_id
    and o.status::text = any(v_open) and oi.product_id = p_product_id;

  v_pool := v_on_hand - v_reserved;
  if v_pool <= 0 then
    return jsonb_build_object('filledUnits', 0, 'filledLines', 0, 'orders', 0);
  end if;

  -- Oldest order first — backorders age into priority.
  for v_line in
    select oi.id, oi.order_id, oi.quantity_requested, oi.quantity_allocated
    from app.order_items oi
    join app.orders o on o.id = oi.order_id
    where o.org_id = p_org_id and o.warehouse_id = p_warehouse_id
      and o.status::text = any(v_open) and oi.product_id = p_product_id
      and oi.quantity_allocated < oi.quantity_requested
    order by o.created_at asc nulls last, oi.id asc
  loop
    exit when v_pool <= 0;
    v_take := least(v_line.quantity_requested - v_line.quantity_allocated, v_pool);
    if v_take <= 0 then continue; end if;

    update app.order_items
      set quantity_allocated = quantity_allocated + v_take
      where id = v_line.id;

    v_pool         := v_pool - v_take;
    v_filled_units := v_filled_units + v_take;
    v_filled_lines := v_filled_lines + 1;
    if not (v_line.order_id = any(v_orders)) then
      v_orders := v_orders || v_line.order_id;
    end if;
  end loop;

  return jsonb_build_object(
    'filledUnits', v_filled_units,
    'filledLines', v_filled_lines,
    'orders', coalesce(array_length(v_orders, 1), 0)
  );
end;
$$;

revoke all on function app.fill_backorders(uuid, uuid, uuid) from public;
grant execute on function app.fill_backorders(uuid, uuid, uuid) to authenticated, service_role;
