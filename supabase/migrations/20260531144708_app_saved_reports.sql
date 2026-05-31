-- Custom report builder: user-defined, reusable reports over predefined datasets.
create table if not exists app.saved_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.orgs(id) on delete cascade,
  name text not null,
  dataset text not null,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists saved_reports_org_idx
  on app.saved_reports (org_id, created_at desc);

alter table app.saved_reports enable row level security;

create policy saved_reports_select on app.saved_reports
  for select using (app.is_org_member(org_id));
create policy saved_reports_write on app.saved_reports
  for all using (app.is_org_member(org_id)) with check (app.is_org_member(org_id));

grant select, insert, update, delete on app.saved_reports to authenticated;
grant all on app.saved_reports to service_role;

comment on table app.saved_reports is
  'User-defined reports: dataset id + config (selected columns + filters). Read-only builder over predefined datasets.';
