-- inventory_list: scope the location aggregation to the caller's org.
--
-- The scoped_loc CTE aggregated app.locations across ALL orgs (the function is
-- SECURITY DEFINER, so RLS does not narrow it) and relied on the products join
-- to drop other tenants' rows. Results were correct, but every call paid a
-- group-by over the entire multi-tenant locations table.

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
      select l.product_id, sum(l.quantity) as qty,
             (array_agg(s.code order by s.code, l.bay, l.level))[1] as code,
             (array_agg(l.bay  order by s.code, l.bay, l.level))[1] as bay,
             (array_agg(l.level order by s.code, l.bay, l.level))[1] as lvl
      from app.locations l join app.sections s on s.id = l.section_id
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
             and coalesce(sl.qty,0) <= coalesce(p.reorder_point,0))))
    select f.*, count(*) over()::bigint as total_count
    from filtered f order by %s limit $8 offset $9
  $q$, order_sql) using p_org,p_facility,p_q,p_category,p_low_only,p_sort,p_order,p_limit,p_offset;
end $function$;
