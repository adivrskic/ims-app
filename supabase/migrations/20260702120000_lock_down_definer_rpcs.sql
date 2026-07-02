-- Security: lock down two SECURITY DEFINER RPCs that were directly callable via
-- PostgREST by anon/authenticated.
--
-- app.inventory_list(p_org, …) is SECURITY DEFINER (bypasses RLS) and filters by
-- the caller-supplied p_org WITHOUT checking membership. Because anon/authenticated
-- held EXECUTE, anyone with the public anon key could call
-- POST /rest/v1/rpc/inventory_list { p_org: <any-org-id> } and read that org's
-- entire inventory (names, SKUs, on-hand, locations) — a cross-org data leak.
--
-- app.snapshot_inventory() is SECURITY DEFINER and snapshots EVERY org; it should
-- only ever run from the cron/service-role path.
--
-- The app calls both exclusively through the service-role admin client
-- (inventory/export route, lib/data/inventory.ts, lib/data/kiosk.ts — all
-- createAdminClient), passing a server-resolved orgId. So revoking anon +
-- authenticated EXECUTE closes the direct PostgREST vector with no impact on the
-- app. (is_org_member / has_org_role are intentionally left callable — they're
-- RLS helpers that only report on the caller's own membership.)

-- NOTE: Postgres grants function EXECUTE to PUBLIC by default, and anon/
-- authenticated inherit it through PUBLIC — so we must revoke from PUBLIC, not
-- just the named roles.
revoke execute on function
  app.inventory_list(uuid, uuid, text, uuid, boolean, text, text, integer, integer)
  from public, anon, authenticated;

revoke execute on function app.snapshot_inventory() from public, anon, authenticated;

-- Keep the service-role path explicit.
grant execute on function
  app.inventory_list(uuid, uuid, text, uuid, boolean, text, text, integer, integer)
  to service_role;
grant execute on function app.snapshot_inventory() to service_role;
