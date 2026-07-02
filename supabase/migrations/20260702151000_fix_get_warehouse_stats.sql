-- Fix a latent bug in get_warehouse_stats (mobile app's KPI strip).
--
-- The low_stock_count subquery was:
--   (SELECT COUNT(*) FROM products p JOIN locations l ...
--    GROUP BY p.id HAVING SUM(l.quantity) <= p.reorder_point)
-- which returns ONE count row PER low-stock product — invalid as a scalar
-- subquery, so it errors ("more than one row") whenever >1 product is low.
-- It only appeared to work while resolving against the tiny legacy public
-- tables; against the real app data it fails. Wrap it in a COUNT over the
-- grouped set so it returns a single number.
--
-- Also schema-qualify every table to `app.` and pin search_path, so the
-- function is robust regardless of the caller's search_path.

create or replace function public.get_warehouse_stats(wh_id uuid)
 returns table(
   total_products bigint, total_stock bigint, total_sections bigint,
   low_stock_count bigint, items_received_today bigint, active_orders bigint)
 language sql
 stable
 set search_path = app, public
as $function$
  select
    (select count(distinct product_id) from app.locations
       where warehouse_id = wh_id and is_active = true),
    (select coalesce(sum(quantity), 0) from app.locations
       where warehouse_id = wh_id and is_active = true),
    (select count(*) from app.sections where warehouse_id = wh_id),
    (select count(*) from (
       select p.id
       from app.products p
       join app.locations l on l.product_id = p.id
       where l.warehouse_id = wh_id and l.is_active = true and p.reorder_point > 0
       group by p.id, p.reorder_point
       having sum(l.quantity) <= p.reorder_point
     ) low),
    (select count(*) from app.scan_history
       where warehouse_id = wh_id and action = 'receive' and scanned_at >= current_date),
    (select count(*) from app.orders
       where warehouse_id = wh_id and status not in ('complete', 'cancelled'));
$function$;
