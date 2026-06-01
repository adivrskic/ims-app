-- One-time backfill for the pick-decrements-on-hand change
-- (20260531180000_app_pick_decrements_onhand). Until now picking never
-- decremented locations.quantity, so on-hand is inflated by every unit already
-- picked on still-OPEN orders. Decrement those units now so on-hand matches the
-- physical shelf and the reverted ATP formula (on_hand − unpicked-reservation)
-- is correct. Greedy across each product's active, non-quarantined locations,
-- flooring at 0. Scope: OPEN orders only (completed-order inflation is a separate
-- reconciliation — cycle counts).
do $$
declare
  r           record;
  v_remaining integer;
  v_loc       record;
  v_have      integer;
  v_take      integer;
begin
  for r in
    select o.org_id, o.warehouse_id, oi.product_id,
           sum(coalesce(oi.quantity_picked, 0)) as to_decrement
    from app.order_items oi
    join app.orders o on o.id = oi.order_id
    where o.status::text in
            ('created','pick_list_assigned','in_progress','staged','ready','out_for_delivery')
      and oi.product_id is not null
      and coalesce(oi.quantity_picked, 0) > 0
    group by o.org_id, o.warehouse_id, oi.product_id
  loop
    v_remaining := r.to_decrement;
    for v_loc in
      select id, quantity
      from app.locations
      where org_id = r.org_id and warehouse_id = r.warehouse_id
        and product_id = r.product_id and is_active = true and quarantined = false
        and coalesce(quantity, 0) > 0
      order by coalesce(quantity, 0) desc
    loop
      exit when v_remaining <= 0;
      v_have := coalesce(v_loc.quantity, 0);
      v_take := least(v_have, v_remaining);
      update app.locations set quantity = v_have - v_take where id = v_loc.id;
      v_remaining := v_remaining - v_take;
    end loop;
  end loop;
end $$;
