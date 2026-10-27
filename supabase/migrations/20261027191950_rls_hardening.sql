-- RLS hardening (2026-10-26 audit): close the write paths a signed-in member
-- could still take straight through PostgREST with the anon key + a session.
--
-- WHAT WAS WRONG
--   * app.org_members: the UPDATE policy let any owner/admin change ANY
--     column, including their own `role`/`permissions` and a fellow admin's
--     role — the desk action guards this, PostgREST did not.
--   * app.orgs / app.profiles: owners could PATCH tier, sample_data, slug,
--     deleted_at…; a user could PATCH their own email / is_active /
--     digest_last_sent_at. None of these are user-editable in the product.
--   * Several tables still carried the pre-RBAC `FOR ALL using
--     (is_org_member)` write policy, so every member could write them whatever
--     their permission set said (the 20260715 migration covered the stock /
--     order / PO tables; this covers the rest).
--   * app.api_keys had no INSERT policy at all (the action now inserts through
--     the service role; the policy lets the session client do it too).
--   * orders_external_unique_idx was (source, external_id) without org_id, so
--     two workspaces importing the same Shopify order id collided.
--   * Eight legacy public.* SECURITY DEFINER helpers still existed. They are
--     dropped in 20261027192229_drop_legacy_public_helpers.sql: dead policies
--     on legacy.* and public.profiles depended on them, so they ship apart.
--
-- Every statement is idempotent. service_role (the app's admin client), the
-- postgres role (migrations, the SQL editor) and SECURITY DEFINER functions
-- are unaffected by the triggers, which only fire for the client roles.
--
-- Permission keys and MEMBER_DEFAULTS are those of lib/permissions.ts;
-- app.has_any_perm(uuid, text[]) is from 20260715120000_rls_permission_gating.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. org_members: nobody edits their own role/permissions; only owners
--    change roles. (Non-role/permission columns — joined_at — stay as the
--    policy allows.)
-- ───────────────────────────────────────────────────────────────────────────

create or replace function app.guard_member_role_change()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Nothing sensitive changed → allow.
  if new.role is not distinct from old.role
     and new.permissions is not distinct from old.permissions then
    return new;
  end if;

  -- Never your own role or permission set.
  if new.user_id = (select auth.uid()) or old.user_id = (select auth.uid()) then
    raise exception 'You cannot change your own role or permissions'
      using errcode = '42501';
  end if;

  -- Reassigning org_id / user_id on a membership row is never legitimate.
  if new.org_id is distinct from old.org_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Membership rows cannot be re-pointed'
      using errcode = '42501';
  end if;

  -- Role changes are an owner's call.
  if new.role is distinct from old.role
     and not app.has_org_role(old.org_id, array['owner']) then
    raise exception 'Only an owner can change a member''s role'
      using errcode = '42501';
  end if;

  -- Permission edits: owners always; admins only on members (never on a
  -- fellow admin or an owner) — mirrors setMemberPermissions in the desk.
  if new.permissions is not distinct from old.permissions then
    return new;
  end if;
  if app.has_org_role(old.org_id, array['owner']) then
    return new;
  end if;
  if old.role = 'member' and app.has_org_role(old.org_id, array['admin']) then
    return new;
  end if;
  raise exception 'Only an owner can change this member''s permissions'
    using errcode = '42501';
end;
$$;

revoke all on function app.guard_member_role_change() from public, anon, authenticated;

drop trigger if exists org_members_guard_role_change on app.org_members;
create trigger org_members_guard_role_change
  before update on app.org_members
  for each row execute function app.guard_member_role_change();

-- The UPDATE policy stays owner/admin-scoped (the trigger does the column
-- work); recreate it so an environment missing it is covered too.
drop policy if exists members_update on app.org_members;
create policy members_update on app.org_members
  for update using (app.has_org_role(org_id, array['owner', 'admin']))
  with check (app.has_org_role(org_id, array['owner', 'admin']));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. orgs: support-only columns can't be changed from a session.
--    (All of tier, sample_data, deleted_at, onboarded_by, onboarded_at, notes
--    and slug exist on the live table; trial_started_at already has its own
--    guard from 20260913120000.)
-- ───────────────────────────────────────────────────────────────────────────

create or replace function app.guard_org_client_columns()
  returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.tier          is distinct from old.tier
    or new.sample_data   is distinct from old.sample_data
    or new.deleted_at    is distinct from old.deleted_at
    or new.onboarded_by  is distinct from old.onboarded_by
    or new.onboarded_at  is distinct from old.onboarded_at
    or new.notes         is distinct from old.notes
    or new.slug          is distinct from old.slug then
      raise exception 'tier, sample_data, deleted_at, onboarded_by, onboarded_at, notes and slug can only be changed by Nautilus support'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orgs_guard_client_columns on app.orgs;
create trigger orgs_guard_client_columns
  before update of tier, sample_data, deleted_at, onboarded_by, onboarded_at, notes, slug
  on app.orgs
  for each row execute function app.guard_org_client_columns();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. profiles: email, is_active and the digest watermark are system-owned.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function app.guard_profile_client_columns()
  returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.email               is distinct from old.email
    or new.is_active           is distinct from old.is_active
    or new.digest_last_sent_at is distinct from old.digest_last_sent_at then
      raise exception 'email, is_active and digest_last_sent_at are managed by the system'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_client_columns on app.profiles;
create trigger profiles_guard_client_columns
  before update of email, is_active, digest_last_sent_at on app.profiles
  for each row execute function app.guard_profile_client_columns();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Permission-gated writes replacing the remaining membership-only
--    FOR ALL policies. Each keeps a membership-scoped SELECT.
-- ───────────────────────────────────────────────────────────────────────────

-- adjustment_reasons → adjustments.approve (desk: "manage reasons").
drop policy if exists adjustment_reasons_write on app.adjustment_reasons;
drop policy if exists adjustment_reasons_select on app.adjustment_reasons;
drop policy if exists adjustment_reasons_insert on app.adjustment_reasons;
drop policy if exists adjustment_reasons_update on app.adjustment_reasons;
drop policy if exists adjustment_reasons_delete on app.adjustment_reasons;
create policy adjustment_reasons_select on app.adjustment_reasons
  for select using (app.is_org_member(org_id));
create policy adjustment_reasons_insert on app.adjustment_reasons
  for insert with check (app.has_any_perm(org_id, array['adjustments.approve']));
create policy adjustment_reasons_update on app.adjustment_reasons
  for update using (app.has_any_perm(org_id, array['adjustments.approve']))
  with check (app.has_any_perm(org_id, array['adjustments.approve']));
create policy adjustment_reasons_delete on app.adjustment_reasons
  for delete using (app.has_any_perm(org_id, array['adjustments.approve']));

-- customers → customers.manage.
drop policy if exists customers_write on app.customers;
drop policy if exists customers_select on app.customers;
drop policy if exists customers_insert on app.customers;
drop policy if exists customers_update on app.customers;
drop policy if exists customers_delete on app.customers;
create policy customers_select on app.customers
  for select using (app.is_org_member(org_id));
create policy customers_insert on app.customers
  for insert with check (app.has_any_perm(org_id, array['customers.manage']));
create policy customers_update on app.customers
  for update using (app.has_any_perm(org_id, array['customers.manage']))
  with check (app.has_any_perm(org_id, array['customers.manage']));
create policy customers_delete on app.customers
  for delete using (app.has_any_perm(org_id, array['customers.manage']));

-- kit_components / work_orders / work_order_lines → work_orders.manage.
drop policy if exists kit_components_write on app.kit_components;
drop policy if exists kit_components_select on app.kit_components;
drop policy if exists kit_components_insert on app.kit_components;
drop policy if exists kit_components_update on app.kit_components;
drop policy if exists kit_components_delete on app.kit_components;
create policy kit_components_select on app.kit_components
  for select using (app.is_org_member(org_id));
create policy kit_components_insert on app.kit_components
  for insert with check (app.has_any_perm(org_id, array['work_orders.manage']));
create policy kit_components_update on app.kit_components
  for update using (app.has_any_perm(org_id, array['work_orders.manage']))
  with check (app.has_any_perm(org_id, array['work_orders.manage']));
create policy kit_components_delete on app.kit_components
  for delete using (app.has_any_perm(org_id, array['work_orders.manage']));

drop policy if exists work_orders_write on app.work_orders;
drop policy if exists work_orders_select on app.work_orders;
drop policy if exists work_orders_insert on app.work_orders;
drop policy if exists work_orders_update on app.work_orders;
drop policy if exists work_orders_delete on app.work_orders;
create policy work_orders_select on app.work_orders
  for select using (app.is_org_member(org_id));
create policy work_orders_insert on app.work_orders
  for insert with check (app.has_any_perm(org_id, array['work_orders.manage']));
create policy work_orders_update on app.work_orders
  for update using (app.has_any_perm(org_id, array['work_orders.manage']))
  with check (app.has_any_perm(org_id, array['work_orders.manage']));
create policy work_orders_delete on app.work_orders
  for delete using (app.has_any_perm(org_id, array['work_orders.manage']));

drop policy if exists work_order_lines_write on app.work_order_lines;
drop policy if exists work_order_lines_select on app.work_order_lines;
drop policy if exists work_order_lines_insert on app.work_order_lines;
drop policy if exists work_order_lines_update on app.work_order_lines;
drop policy if exists work_order_lines_delete on app.work_order_lines;
create policy work_order_lines_select on app.work_order_lines
  for select using (app.is_org_member(org_id));
create policy work_order_lines_insert on app.work_order_lines
  for insert with check (app.has_any_perm(org_id, array['work_orders.manage']));
create policy work_order_lines_update on app.work_order_lines
  for update using (app.has_any_perm(org_id, array['work_orders.manage']))
  with check (app.has_any_perm(org_id, array['work_orders.manage']));
create policy work_order_lines_delete on app.work_order_lines
  for delete using (app.has_any_perm(org_id, array['work_orders.manage']));

-- sections / layout_elements / layout_snapshots → facilities.manage.
drop policy if exists sections_write on app.sections;
drop policy if exists sections_select on app.sections;
drop policy if exists sections_insert on app.sections;
drop policy if exists sections_update on app.sections;
drop policy if exists sections_delete on app.sections;
create policy sections_select on app.sections
  for select using (app.is_org_member(org_id));
create policy sections_insert on app.sections
  for insert with check (app.has_any_perm(org_id, array['facilities.manage']));
create policy sections_update on app.sections
  for update using (app.has_any_perm(org_id, array['facilities.manage']))
  with check (app.has_any_perm(org_id, array['facilities.manage']));
create policy sections_delete on app.sections
  for delete using (app.has_any_perm(org_id, array['facilities.manage']));

drop policy if exists layout_elements_write on app.layout_elements;
drop policy if exists layout_elements_select on app.layout_elements;
drop policy if exists layout_elements_insert on app.layout_elements;
drop policy if exists layout_elements_update on app.layout_elements;
drop policy if exists layout_elements_delete on app.layout_elements;
create policy layout_elements_select on app.layout_elements
  for select using (app.is_org_member(org_id));
create policy layout_elements_insert on app.layout_elements
  for insert with check (app.has_any_perm(org_id, array['facilities.manage']));
create policy layout_elements_update on app.layout_elements
  for update using (app.has_any_perm(org_id, array['facilities.manage']))
  with check (app.has_any_perm(org_id, array['facilities.manage']));
create policy layout_elements_delete on app.layout_elements
  for delete using (app.has_any_perm(org_id, array['facilities.manage']));

drop policy if exists snapshots_write on app.layout_snapshots;
drop policy if exists snapshots_select on app.layout_snapshots;
drop policy if exists snapshots_insert on app.layout_snapshots;
drop policy if exists snapshots_update on app.layout_snapshots;
drop policy if exists snapshots_delete on app.layout_snapshots;
create policy snapshots_select on app.layout_snapshots
  for select using (app.is_org_member(org_id));
create policy snapshots_insert on app.layout_snapshots
  for insert with check (app.has_any_perm(org_id, array['facilities.manage']));
create policy snapshots_update on app.layout_snapshots
  for update using (app.has_any_perm(org_id, array['facilities.manage']))
  with check (app.has_any_perm(org_id, array['facilities.manage']));
create policy snapshots_delete on app.layout_snapshots
  for delete using (app.has_any_perm(org_id, array['facilities.manage']));

-- serial_units → inventory.adjust (a member default, so floor flows keep working).
drop policy if exists serial_units_write on app.serial_units;
drop policy if exists serial_units_select on app.serial_units;
drop policy if exists serial_units_insert on app.serial_units;
drop policy if exists serial_units_update on app.serial_units;
drop policy if exists serial_units_delete on app.serial_units;
create policy serial_units_select on app.serial_units
  for select using (app.is_org_member(org_id));
create policy serial_units_insert on app.serial_units
  for insert with check (app.has_any_perm(org_id, array['inventory.adjust']));
create policy serial_units_update on app.serial_units
  for update using (app.has_any_perm(org_id, array['inventory.adjust']))
  with check (app.has_any_perm(org_id, array['inventory.adjust']));
create policy serial_units_delete on app.serial_units
  for delete using (app.has_any_perm(org_id, array['inventory.adjust']));

-- webhook_endpoints → integrations.manage (reads too: the row holds the
-- encrypted URL + secret, which is integration config, not floor data).
drop policy if exists webhook_endpoints_write on app.webhook_endpoints;
drop policy if exists webhook_endpoints_read on app.webhook_endpoints;
drop policy if exists webhook_endpoints_select on app.webhook_endpoints;
drop policy if exists webhook_endpoints_insert on app.webhook_endpoints;
drop policy if exists webhook_endpoints_update on app.webhook_endpoints;
drop policy if exists webhook_endpoints_delete on app.webhook_endpoints;
create policy webhook_endpoints_select on app.webhook_endpoints
  for select using (app.has_any_perm(org_id, array['integrations.manage']));
create policy webhook_endpoints_insert on app.webhook_endpoints
  for insert with check (app.has_any_perm(org_id, array['integrations.manage']));
create policy webhook_endpoints_update on app.webhook_endpoints
  for update using (app.has_any_perm(org_id, array['integrations.manage']))
  with check (app.has_any_perm(org_id, array['integrations.manage']));
create policy webhook_endpoints_delete on app.webhook_endpoints
  for delete using (app.has_any_perm(org_id, array['integrations.manage']));

-- saved_reports → reports.manage (a member default).
drop policy if exists saved_reports_write on app.saved_reports;
drop policy if exists saved_reports_select on app.saved_reports;
drop policy if exists saved_reports_insert on app.saved_reports;
drop policy if exists saved_reports_update on app.saved_reports;
drop policy if exists saved_reports_delete on app.saved_reports;
create policy saved_reports_select on app.saved_reports
  for select using (app.is_org_member(org_id));
create policy saved_reports_insert on app.saved_reports
  for insert with check (app.has_any_perm(org_id, array['reports.manage']));
create policy saved_reports_update on app.saved_reports
  for update using (app.has_any_perm(org_id, array['reports.manage']))
  with check (app.has_any_perm(org_id, array['reports.manage']));
create policy saved_reports_delete on app.saved_reports
  for delete using (app.has_any_perm(org_id, array['reports.manage']));

-- cycle_counts: recording a count is inventory.adjust (select/update policies
-- from the base schema are left as they are).
drop policy if exists cycle_counts_insert on app.cycle_counts;
create policy cycle_counts_insert on app.cycle_counts
  for insert with check (app.has_any_perm(org_id, array['inventory.adjust']));

-- scan_history: an audit row needs a capability that moves stock.
drop policy if exists scan_insert on app.scan_history;
create policy scan_insert on app.scan_history
  for insert with check (
    app.has_any_perm(org_id, array['inventory.adjust', 'purchasing.receive', 'orders.manage'])
  );

-- Integration logs are integration config → integrations.manage to read.
drop policy if exists shopify_webhook_log_read on app.shopify_webhook_log;
create policy shopify_webhook_log_read on app.shopify_webhook_log
  for select using (app.has_any_perm(org_id, array['integrations.manage']));

drop policy if exists webhook_deliveries_read on app.webhook_deliveries;
create policy webhook_deliveries_read on app.webhook_deliveries
  for select using (app.has_any_perm(org_id, array['integrations.manage']));

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Stripe webhook event ledger (idempotency + ordering). Service role only:
--    RLS on, no policies. `subscription_id` is stamped after an event is
--    applied so a later, older event for the same subscription can be skipped.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists app.stripe_events (
  id text primary key,
  created bigint not null,
  received_at timestamptz default now()
);
alter table app.stripe_events add column if not exists subscription_id text;
alter table app.stripe_events enable row level security;
create index if not exists stripe_events_subscription_created_idx
  on app.stripe_events (subscription_id, created desc)
  where subscription_id is not null;
revoke all on table app.stripe_events from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. api_keys INSERT: settings.manage, and the key must be minted as yourself.
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists api_keys_insert on app.api_keys;
create policy api_keys_insert on app.api_keys
  for insert with check (
    app.has_any_perm(org_id, array['settings.manage'])
    and created_by = (select auth.uid())
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Shopify order idempotency is per workspace.
-- ───────────────────────────────────────────────────────────────────────────

drop index if exists app.orders_external_unique_idx;
create unique index if not exists orders_external_unique_idx
  on app.orders (org_id, source, external_id)
  where external_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 9. Slot lookup index: putaway / relocate / cycle-count resolve a slot by
--    (org, facility, section, bay, level, product) on every scan.
-- ───────────────────────────────────────────────────────────────────────────

create index if not exists idx_locations_slot_lookup
  on app.locations (org_id, warehouse_id, section_id, bay, level, product_id)
  where is_active;
