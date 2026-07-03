-- Recurring cycle-count scheduling.
--
-- lib/cycle-risk.ts already ranks which SKUs to count next, but counts were
-- one-off manual events. This adds a persistent count QUEUE: a weekly cron
-- (/api/cron/cycle-count-queue) turns the risk ranking into pending tasks for
-- orgs that opt in, operators work the queue from the cycle-counts page, and
-- recording a count auto-completes the matching task.

-- Org opt-in, mirroring orgs.auto_draft_pos_enabled.
alter table app.orgs
  add column if not exists auto_cycle_counts_enabled boolean not null default false;

create table if not exists app.cycle_count_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.orgs(id) on delete cascade,
  product_id uuid not null references app.products(id) on delete cascade,
  warehouse_id uuid references app.warehouses(id) on delete set null,
  -- Risk snapshot at queue time (score is only meaningful as a ranking).
  score numeric not null default 0,
  reason text,
  due_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'dismissed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null
);

-- One open task per product per org — re-queueing an already-queued SKU is a
-- no-op (the cron filters, this backstops races).
create unique index if not exists idx_cc_tasks_one_pending
  on app.cycle_count_tasks (org_id, product_id)
  where status = 'pending';

create index if not exists idx_cc_tasks_org_status_due
  on app.cycle_count_tasks (org_id, status, due_date);
create index if not exists idx_cc_tasks_product
  on app.cycle_count_tasks (product_id);
create index if not exists idx_cc_tasks_warehouse
  on app.cycle_count_tasks (warehouse_id);

alter table app.cycle_count_tasks enable row level security;

-- Single FOR ALL policy (repo convention post-consolidation): members read
-- and work the queue; writes from the cron use the service role.
create policy cycle_count_tasks_all on app.cycle_count_tasks
  for all using (app.is_org_member(org_id))
  with check (app.is_org_member(org_id));

-- Weekly queue generation — Mondays 05:00 UTC, same vault-secret pattern as
-- the other cron jobs (see 20260703121000_pg_cron_schedules.sql).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cycle-count-queue-weekly') then
    perform cron.unschedule('cycle-count-queue-weekly');
  end if;
end $$;

select cron.schedule('cycle-count-queue-weekly', '0 5 * * 1', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_app_url')
           || '/api/cron/cycle-count-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$);
