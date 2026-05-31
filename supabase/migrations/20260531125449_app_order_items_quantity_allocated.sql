-- Allocation / ATP / backorders (internal feature). Stock reserved to a line.
-- Available-to-promise is derived: ATP = on_hand - Σ max(0, allocated - picked)
-- over open orders. Backordered (line) = quantity_requested - quantity_allocated.
alter table app.order_items
  add column if not exists quantity_allocated integer not null default 0;

comment on column app.order_items.quantity_allocated is
  'Units of on-hand stock reserved to this line. 0 = unallocated. ATP = on_hand minus the unpicked portion of allocations across open orders; backorder = quantity_requested - quantity_allocated.';

alter table app.order_items
  add constraint order_items_quantity_allocated_nonneg
  check (quantity_allocated >= 0);
