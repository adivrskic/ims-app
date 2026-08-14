-- inventory_list: align "low stock" with app.overview_low_stock.
--
-- The Overview KPI card ("N low") reads app.inventory_list with p_low_only,
-- while the reorder panel directly beneath it reads app.overview_low_stock.
-- The two disagreed on what counts as stock, so the card could contradict the
-- list right under it. Product decision (2026-08-14): the OVERVIEW rule wins.
--
-- Two separate discrepancies lived in the scoped_loc CTE:
--
-- 1. LOCATIONS WITH NO SECTION were dropped entirely, because scoped_loc did
--    `join app.sections s on s.id = l.section_id` (INNER). Stock in a location
--    that hasn't been assigned to a section is real stock, and it was invisible
--    in on_hand everywhere this function feeds — the Inventory list, not just
--    the low filter. That is a plain bug, fixed here with a LEFT JOIN.
--
--    Facility scoping is unchanged: with p_facility set, `s.warehouse_id = $2`
--    is false for a null section, so those rows still drop out when scoped —
--    exactly what overview_low_stock does with its `section_id in (...)`.
--
-- 2. QUARANTINED UNITS were counted. overview_low_stock excludes them, and it
--    is right to: quarantined stock cannot be picked or sold, so letting it
--    mask a reorder need is how you stock out holding inventory you can't ship.
--
-- DELIBERATE ASYMMETRY, so all three surfaces stay coherent:
--
--   on_hand            = physical stock, INCLUDING quarantined.
--                        Unchanged meaning, and still agrees with
--                        app.overview_stock_total.
--   low-stock predicate = available stock, EXCLUDING quarantined.
--                        Now agrees with app.overview_low_stock.
--
-- So a SKU can read on_hand 30 against a reorder point of 25 and still be
-- flagged low, when 20 of those 30 are quarantined. That is intended: the
-- number says what is in the building, the flag says what you can actually
-- ship. The alternative — netting quarantine out of on_hand — would have made
-- the Inventory page disagree with overview_stock_total instead, just moving
-- the inconsistency somewhere less visible.
--
-- Return type is unchanged, so this is a plain create-or-replace and no caller
-- needs updating.

create or replace function app.inventory_list(
  p_org uuid,
  p_facility uuid default null,
  p_q text default null,
  p_category uuid default null,
  p_low_only boolean default false,
  p_sort text default 'updated',
  p_order text default 'desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid, name text, barcode text, internal_sku text, manufacturer text,
  category_id uuid, category_name text, reorder_point integer,
  updated_at timestamptz, on_hand bigint, primary_location text, total_count bigint
)
language plpgsql
stable security definer
set search_path to 'app', 'public'
as $function$
declare order_sql text; sort_col text;
begin
  sort_col := case p_sort
    when 'name' then 'f.name' when 'reorder' then 'f.reorder_point'
    when 'manufacturer' then 'f.manufacturer' when 'onhand' then 'f.on_hand'
    else 'f.updated_at' end;
  order_sql := sort_col || (case when lower(p_order)='asc' then ' asc' else ' desc' end)
               || ' nulls last, f.id asc';
  return query execute format($q$
    with scoped_loc as (
      select l.product_id,
             sum(l.quantity) as qty,
             -- Available = pickable. Drives the low-stock predicate only.
             sum(l.quantity) filter (where not coalesce(l.quarantined,false))
               as qty_available,
             -- s.code is null for unsectioned rows; ORDER BY puts NULLs last,
             -- so a real slot label still wins over 'Unassigned' when a product
             -- sits in both.
             (array_agg(s.code order by s.code, l.bay, l.level))[1] as code,
             (array_agg(l.bay  order by s.code, l.bay, l.level))[1] as bay,
             (array_agg(l.level order by s.code, l.bay, l.level))[1] as lvl
      from app.locations l
      left join app.sections s on s.id = l.section_id
      where coalesce(l.is_active,true)
        and l.org_id = $1
        and ($2 is null or s.warehouse_id = $2)
      group by l.product_id),
    filtered as (
      select p.id, p.name::text, p.barcode::text, p.internal_sku::text,
             p.manufacturer::text, p.category_id, c.name::text as category_name,
             p.reorder_point, p.updated_at,
             coalesce(sl.qty,0)::bigint as on_hand,
             case when sl.code is null then 'Unassigned'
                  else trim(sl.code) || ' · Bay ' || sl.bay || ' · L' || sl.lvl end as primary_location
      from app.products p
      left join scoped_loc sl on sl.product_id = p.id
      left join app.categories c on c.id = p.category_id
      where p.org_id = $1
        and ($3 is null or $3 = '' or p.name ilike '%%'||$3||'%%'
             or p.barcode ilike '%%'||$3||'%%'
             or coalesce(p.internal_sku,'') ilike '%%'||$3||'%%')
        and ($4 is null or p.category_id = $4)
        and (not $5 or (coalesce(p.reorder_point,0) > 0
             and coalesce(sl.qty_available,0) <= coalesce(p.reorder_point,0))))
    select f.*, count(*) over()::bigint as total_count
    from filtered f order by %s limit $8 offset $9
  $q$, order_sql) using p_org,p_facility,p_q,p_category,p_low_only,p_sort,p_order,p_limit,p_offset;
end $function$;
