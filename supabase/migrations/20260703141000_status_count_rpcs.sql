-- Status chip counts for the orders / purchase-orders list pages.
--
-- The dashboard previously fetched every row's status (sequential 1000-row
-- pages) and counted in JS — 50k orders meant 50 serial round trips inside
-- the cached fetcher on every revalidation. One GROUP BY returns the same
-- numbers in a single request, and rides idx_*_org_status_created.
--
-- SECURITY DEFINER with an org parameter and no internal auth check, so
-- EXECUTE is service_role-only (the Next.js server passes the caller's
-- resolved org id), same convention as app.rate_limit_hit.

create or replace function app.order_status_counts(
  p_org uuid,
  p_warehouse uuid default null
)
returns table(status text, count bigint)
language sql
stable
security definer
set search_path to 'app', 'public'
as $$
  select o.status::text, count(*)::bigint
  from app.orders o
  where o.org_id = p_org
    and (p_warehouse is null or o.warehouse_id = p_warehouse)
  group by o.status
$$;

create or replace function app.po_status_counts(
  p_org uuid,
  p_warehouse uuid default null
)
returns table(status text, count bigint)
language sql
stable
security definer
set search_path to 'app', 'public'
as $$
  select po.status::text, count(*)::bigint
  from app.purchase_orders po
  where po.org_id = p_org
    and (p_warehouse is null or po.warehouse_id = p_warehouse)
  group by po.status
$$;

revoke all on function app.order_status_counts(uuid, uuid) from public;
revoke all on function app.order_status_counts(uuid, uuid) from anon;
revoke all on function app.order_status_counts(uuid, uuid) from authenticated;
grant execute on function app.order_status_counts(uuid, uuid) to service_role;

revoke all on function app.po_status_counts(uuid, uuid) from public;
revoke all on function app.po_status_counts(uuid, uuid) from anon;
revoke all on function app.po_status_counts(uuid, uuid) from authenticated;
grant execute on function app.po_status_counts(uuid, uuid) to service_role;
