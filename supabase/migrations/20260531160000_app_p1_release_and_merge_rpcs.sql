-- P1 feature-specific correctness:
--
-- 1. release_order_allocation — releasing an order's reservation (e.g. on cancel)
--    must NOT blanket-zero quantity_allocated: that drops it below quantity_picked
--    and breaks the allocated >= picked invariant the ATP math relies on. Clamp
--    to picked instead, releasing only the still-unpicked reservation back to ATP.
--
-- 2. merge_location_into — the slotting/relocate "merge into existing slot" path
--    did two un-transacted updates (bump target qty, then deactivate source); a
--    failure between them double-counts stock. Do both in one transaction, with
--    the source row locked.

create or replace function app.release_order_allocation(
  p_org_id uuid,
  p_order_id uuid
) returns void
  language sql
  set search_path to ''
as $$
  update app.order_items oi
     set quantity_allocated = coalesce(oi.quantity_picked, 0)
    from app.orders o
   where oi.order_id = p_order_id
     and o.id = oi.order_id
     and o.org_id = p_org_id;
$$;

create or replace function app.merge_location_into(
  p_org_id uuid,
  p_source_id uuid,
  p_target_id uuid
) returns void
  language plpgsql
  set search_path to ''
as $$
declare
  v_source_qty integer;
begin
  -- Lock the source row so a concurrent move/adjust can't race the merge.
  select coalesce(quantity, 0) into v_source_qty
  from app.locations
  where id = p_source_id and org_id = p_org_id
  for update;
  if not found then
    raise exception 'Source location not found' using errcode = 'no_data_found';
  end if;

  update app.locations
     set quantity = coalesce(quantity, 0) + v_source_qty
   where id = p_target_id and org_id = p_org_id;
  if not found then
    raise exception 'Target location not found' using errcode = 'no_data_found';
  end if;

  update app.locations
     set is_active = false
   where id = p_source_id and org_id = p_org_id;
end;
$$;

grant execute on function
  app.release_order_allocation(uuid, uuid),
  app.merge_location_into(uuid, uuid, uuid)
to authenticated, service_role;
