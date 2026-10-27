-- RLS hardening (2026-10-26 audit), part 2: the legacy public.* SECURITY
-- DEFINER helpers. Each reads tables that moved to the `legacy` schema in
-- 20260701191705 (get_user_org_ids reads public.org_members, which no longer
-- exists) or the empty auth-trigger copy public.profiles, so they have been
-- broken or inert since, but stayed callable by anon/authenticated.
--
-- They were still referenced by 16 policies on the quarantined legacy.*
-- tables (anon/authenticated have no USAGE on that schema, so those policies
-- guarded nothing) and by four policies on public.profiles (0 rows; the app
-- reads app.profiles). Those dead policies go first, then the functions —
-- without CASCADE, so any dependent not accounted for here still errors.
-- public.handle_new_user is deliberately left alone: on_auth_user_created
-- still runs it.

-- public.profiles: legacy cross-user policies (own-row select/update stay).
drop policy if exists "Org members view shared-org profiles" on public.profiles;
drop policy if exists "Super admins view all profiles" on public.profiles;
drop policy if exists "Super admins update any profile" on public.profiles;
drop policy if exists "Super admins delete profiles" on public.profiles;

-- legacy.*: policies written against public.has_org_role.
drop policy if exists "Owners and admins update org" on legacy.organizations;
drop policy if exists "Owners and admins manage members" on legacy.org_members;
drop policy if exists "Admins manage org invites" on legacy.org_invites;
drop policy if exists "Admins manage warehouses" on legacy.warehouses;
drop policy if exists "Admins manage sections" on legacy.sections;
drop policy if exists "Admins manage layout_snapshots" on legacy.layout_snapshots;
drop policy if exists "Members manage products" on legacy.products;
drop policy if exists "Members manage locations" on legacy.locations;
drop policy if exists "Members insert scan_history" on legacy.scan_history;
drop policy if exists "Admins amend scan_history" on legacy.scan_history;
drop policy if exists "Admins delete scan_history" on legacy.scan_history;
drop policy if exists "Members manage orders" on legacy.orders;
drop policy if exists "Members manage order_items" on legacy.order_items;
drop policy if exists "Members manage purchase_orders" on legacy.purchase_orders;
drop policy if exists "Members manage po_line_items" on legacy.po_line_items;
drop policy if exists "Members manage returns" on legacy.returns;

drop function if exists public.accept_invite(uuid);
drop function if exists public.bootstrap_workspace(character varying, character varying);
drop function if exists public.create_invite(uuid, character varying, org_role);
drop function if exists public.get_user_org_ids(uuid);
drop function if exists public.get_user_role();
drop function if exists public.get_user_warehouse_ids(uuid);
drop function if exists public.has_org_role(uuid, text[]);
drop function if exists public.has_warehouse_access(uuid);
