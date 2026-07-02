-- L2 fix: make workspace provisioning atomic.
--
-- setUpWorkspace / createAdditionalWorkspace / admin onboard each did org →
-- profile → membership → facility as separate admin writes; a mid-sequence
-- failure left an orphaned org (or profile). This RPC does all of them in ONE
-- transaction, so either the whole workspace exists or none of it does.
--
-- Slug collisions are resolved inside the transaction with a random suffix
-- (the previous read-then-insert had a TOCTOU race). Facility is optional
-- (admin onboard doesn't create one); tier/onboarded_by/notes are optional
-- (only admin onboard sets them).
--
-- SECURITY DEFINER so it can write across the org boundary, but locked to
-- service_role: every caller invokes it through the service-role admin client
-- AFTER doing its own auth + idempotence checks. Not client-callable, so it
-- can't be abused to mint unlimited orgs.

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
  p_notes text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_org_id  uuid;
  v_slug    text := p_slug;
  v_attempt integer := 0;
begin
  -- Insert the org, resolving slug collisions with a random suffix.
  loop
    begin
      insert into app.orgs (name, slug, industry, tier, onboarded_by, onboarded_at, notes)
      values (
        p_name,
        v_slug,
        p_industry,
        coalesce(p_tier, 'starter'),
        p_onboarded_by,
        case when p_onboarded_by is not null then now() else null end,
        nullif(p_notes, '')
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

  -- First facility (optional).
  if coalesce(p_facility_name, '') <> '' then
    insert into app.warehouses (org_id, name, city, state, zip, owner_id, is_active)
    values (
      v_org_id, p_facility_name,
      nullif(p_city, ''), nullif(p_state, ''), nullif(p_zip, ''),
      p_user_id, true
    );
  end if;

  return jsonb_build_object('orgId', v_org_id, 'slug', v_slug, 'name', p_name);
end;
$$;

revoke all on function app.provision_workspace(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function app.provision_workspace(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, text
) to service_role;
