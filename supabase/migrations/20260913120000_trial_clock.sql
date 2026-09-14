-- 7-day free trial: the per-workspace trial clock.
--
-- Adds app.orgs.trial_started_at, the one fact the app needs to run a no-card
-- free trial. Everything derived from it — the trial's end (start + 7 × 24h),
-- whether a workspace is gated, the shell pill, the billing page, the public
-- API's 402 — is decided in ONE place, lib/entitlement.ts:
--
--   trial_started_at IS NULL → grandfathered: no trial clock, never gated.
--                              That is every org that exists when this runs.
--   trial_started_at = t     → on a 7-day trial from t. From t + 7 days the
--                              workspace is gated unless its org_subscriptions
--                              status is active, trialing or past_due.
--
-- WHY TWO ALTERs — do not "tidy" them into one. `add column ... default now()`
-- stamps every EXISTING row as well (Postgres evaluates a non-volatile default
-- once and applies it table-wide), which would start a 7-day clock on every
-- current customer the moment this ran and lock them all out a week later.
-- Adding the column bare leaves existing rows NULL; setting the default
-- afterwards only affects rows inserted from then on. Every statement in this
-- file is idempotent, so running it again changes nothing for anyone.
--
-- provision_workspace is deliberately untouched: its INSERT doesn't name the
-- column, so every creation path (onboarding, /workspaces/new, staff
-- onboarding at /admin/onboard) picks up the default — with no RPC signature
-- change that could break signups if the app and this migration ship out of
-- order.
--
-- Support (service role or the SQL editor; client roles are refused, below):
--   waive one workspace's trial:  update app.orgs set trial_started_at = null where id = '<org id>';
--   extend it by N days:          update app.orgs set trial_started_at = trial_started_at + interval 'N days' where id = '<org id>';
--
-- DEPLOY ORDER
--   1. Apply this migration.
--   2. Deploy the app that reads it.
-- The app fails open without the column (no clock → never gated), so the
-- reverse order locks no one out. But a workspace created by the new app
-- before this runs has no column to stamp and comes out NULL — grandfathered
-- forever. Deploy the app soon after, too: workspaces created in between are
-- already on the clock, and any that pass 7 days first are gated the moment
-- the app ships.

-- ── The clock ────────────────────────────────────────────────────────────

alter table app.orgs add column if not exists trial_started_at timestamptz;
alter table app.orgs alter column trial_started_at set default now();

comment on column app.orgs.trial_started_at is
  'When this workspace''s 7-day free trial started. NULL = grandfathered (created before trials shipped; never gated). The rules live in lib/entitlement.ts.';

-- ── Clients can't move the clock ─────────────────────────────────────────
-- The orgs UPDATE policy is column-unrestricted for owners and admins (see
-- 20260908120000_onboarding_wizard.sql). Without this, an owner could PATCH
-- their own trial_started_at to NULL from the browser, with nothing but the
-- public anon key and their session, and grandfather themselves out of
-- billing. The client roles can neither change the clock nor pick it on
-- insert. service_role (the app's admin client), postgres (migrations, the SQL
-- editor) and SECURITY DEFINER functions such as provision_workspace run as
-- other roles and keep full control.

create or replace function app.guard_org_trial_clock()
  returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.trial_started_at := now();
    elsif new.trial_started_at is distinct from old.trial_started_at then
      raise exception 'trial_started_at can only be changed by Nautilus support'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orgs_guard_trial_clock on app.orgs;
create trigger orgs_guard_trial_clock
  before insert or update of trial_started_at on app.orgs
  for each row execute function app.guard_org_trial_clock();

-- ── Clients can't mark themselves paid ───────────────────────────────────
-- A paid status lifts the gate. org_subscriptions and its RLS predate this
-- repo (docs/QA-TEST-PLAN.md §2, finding D), so nothing here proves a client
-- can't write it. Its only writer is the Stripe webhook, through the service
-- role; the app only reads it with a user session. Take write privileges away
-- from the client roles outright; reads are untouched. Skipped where the table
-- doesn't exist (an environment rebuilt from these migrations alone).

do $$
begin
  if to_regclass('app.org_subscriptions') is not null then
    revoke insert, update, delete, truncate on table app.org_subscriptions
      from anon, authenticated;
  end if;
end
$$;
