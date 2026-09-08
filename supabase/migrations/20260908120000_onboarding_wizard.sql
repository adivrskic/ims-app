-- Onboarding wizard: persist the setup choices that customize the workspace.
--
-- The rebuilt /onboarding wizard asks plain-language questions (industry,
-- "how you work" activities, what to see first, operation size) and derives:
--   orgs.enabled_modules        text[]  nav-key module slugs; NULL = everything
--                                       on (existing orgs keep today's exact
--                                       nav + dashboard — zero backfill)
--   orgs.priorities             text[]  ordered dashboard priorities (app-capped
--                                       at 3); NULL = default ordering
--   orgs.onboarding             jsonb   raw wizard answers, kept for
--                                       re-derivation and support
--   orgs.onboarding_completed_at        self-serve completion marker
--                                       (onboarded_by/onboarded_at stay
--                                       reserved for staff provisioning)
--   warehouses.size_class       text    single_room | single_site | multi_site
--   profiles.dashboard_prefs    jsonb   per-user overrides (mirrors nav_prefs;
--                                       currently {dismissed_getting_started});
--                                       writable via existing profiles_update_self
--
-- Values are app-validated (lib/modules.ts) and every resolver skips unknown
-- keys, because the org UPDATE RLS policy is column-unrestricted for
-- owner/admin. size_class gets a DB CHECK per the floor_unit pattern.
--
-- provision_workspace is DROPPED and re-created with the new wizard params
-- (REVOKE/GRANT are per-signature). The new version additionally:
--   - takes pg_advisory_xact_lock on the user id, and with
--     p_require_no_membership (self-serve onboarding) refuses to create a
--     second org for the same user — closing the two-tab double-submit race
--     the app-side check-then-act could not
--   - seeds the default 'Receiving' door layout element so the day-0
--     facility matches ones added later via /facilities (slotting anchor)
--
-- NOTE (house convention): applied to the live project via the Supabase MCP
-- apply_migration, whose remote version stamp differs from this filename;
-- this checked-in file is the consolidated source of truth.

-- ── Columns ──────────────────────────────────────────────────────────────

-- Declare the live-only columns in-repo too (no-ops on the live DB; closes
-- part of the documented migration-vs-live drift for rebuilt environments).
alter table app.orgs add column if not exists industry text;
alter table app.profiles add column if not exists nav_prefs jsonb;

alter table app.orgs add column if not exists enabled_modules text[];
alter table app.orgs add column if not exists priorities text[];
alter table app.orgs add column if not exists onboarding jsonb;
alter table app.orgs add column if not exists onboarding_completed_at timestamptz;

alter table app.warehouses add column if not exists size_class text;
alter table app.warehouses drop constraint if exists warehouses_size_class_check;
alter table app.warehouses add constraint warehouses_size_class_check
  check (size_class is null or size_class in ('single_room', 'single_site', 'multi_site'));

alter table app.profiles add column if not exists dashboard_prefs jsonb;

-- ── provision_workspace v2 ───────────────────────────────────────────────

drop function if exists app.provision_workspace(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, text
);

create or replace function app.provision_workspace(
  p_user_id uuid,
  p_user_email text,
  p_full_name text,
  p_name text,
  p_slug text,
  p_industry text default null,
  p_facility_name text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null,
  p_tier text default null,
  p_onboarded_by uuid default null,
  p_notes text default null,
  p_enabled_modules text[] default null,
  p_priorities text[] default null,
  p_onboarding jsonb default null,
  p_size_class text default null,
  p_require_no_membership boolean default false
) returns jsonb
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_org_id       uuid;
  v_slug         text := p_slug;
  v_attempt      integer := 0;
  v_warehouse_id uuid;
  v_canvas_w     numeric;
  v_canvas_h     numeric;
begin
  -- Serialize concurrent provisioning for the same user (two-tab submits).
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Self-serve onboarding must never mint a second org for a user who is
  -- already a member; additional workspaces (/workspaces/new) and staff
  -- onboarding pass false and skip this.
  if p_require_no_membership and exists (
    select 1 from app.org_members where user_id = p_user_id
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  -- Insert the org, resolving slug collisions with a random suffix.
  loop
    begin
      insert into app.orgs (
        name, slug, industry, tier, onboarded_by, onboarded_at, notes,
        enabled_modules, priorities, onboarding, onboarding_completed_at
      )
      values (
        p_name,
        v_slug,
        p_industry,
        coalesce(p_tier, 'starter'),
        p_onboarded_by,
        case when p_onboarded_by is not null then now() else null end,
        nullif(p_notes, ''),
        p_enabled_modules,
        p_priorities,
        p_onboarding,
        case when p_onboarded_by is null then now() else null end
      )
      returning id into v_org_id;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 5 then raise; end if;
      v_slug := left(p_slug, 55) || '-' || substr(md5(random()::text), 1, 4);
    end;
  end loop;

  -- Profile (self-signup may not have created one; onboard creates a fresh user).
  insert into app.profiles (id, email, full_name)
  values (p_user_id, p_user_email, nullif(p_full_name, ''))
  on conflict (id) do nothing;

  -- Owner membership.
  insert into app.org_members (org_id, user_id, role)
  values (v_org_id, p_user_id, 'owner');

  -- First facility (optional), with the default 'Receiving' door layout
  -- element so the day-0 facility has a slotting travel-distance anchor,
  -- matching facilities created later via /facilities.
  if coalesce(p_facility_name, '') <> '' then
    insert into app.warehouses (org_id, name, city, state, zip, owner_id, is_active, size_class)
    values (
      v_org_id, p_facility_name,
      nullif(p_city, ''), nullif(p_state, ''), nullif(p_zip, ''),
      p_user_id, true,
      case
        when p_size_class in ('single_room', 'single_site', 'multi_site')
        then p_size_class
        else null
      end
    )
    returning id, floor_canvas_width, floor_canvas_height
      into v_warehouse_id, v_canvas_w, v_canvas_h;

    insert into app.layout_elements (
      org_id, warehouse_id, kind,
      floor_x, floor_y, floor_width, floor_height,
      rotation, color, label, data, sort_order
    )
    values (
      v_org_id, v_warehouse_id, 'door',
      greatest(0, coalesce(v_canvas_w, 1200) / 2 - 24),
      greatest(0, coalesce(v_canvas_h, 800) - 12 - 4),
      48, 12,
      0, '#D4A853', 'Receiving', '{}'::jsonb, 0
    );
  end if;

  return jsonb_build_object('orgId', v_org_id, 'slug', v_slug, 'name', p_name);
end;
$$;

revoke all on function app.provision_workspace(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, text,
  text[], text[], jsonb, text, boolean
) from public, anon, authenticated;
grant execute on function app.provision_workspace(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, text,
  text[], text[], jsonb, text, boolean
) to service_role;
