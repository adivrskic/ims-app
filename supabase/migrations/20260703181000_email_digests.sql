-- Daily email digests of unread in-app notifications.
--
-- Opt-in per user (profiles toggle on the notifications page). A daily cron
-- (/api/cron/email-digests) mails each opted-in user their unread
-- notifications via the platform Resend account (lib/email/system.ts) —
-- the same system-mail path as team invites, so it works regardless of
-- whether the org connected its own Resend integration.

alter table app.profiles
  add column if not exists digest_email_enabled boolean not null default false,
  add column if not exists digest_last_sent_at timestamptz;

comment on column app.profiles.digest_email_enabled is
  'User opt-in for the daily unread-notification email digest.';
comment on column app.profiles.digest_last_sent_at is
  'Last time the digest cron mailed this user; digests only send when new notifications arrived after this.';

create index if not exists idx_profiles_digest_enabled
  on app.profiles (id)
  where digest_email_enabled;

-- Daily at 12:00 UTC (morning in the Americas), same vault pattern as the
-- other HTTP crons (see 20260703121000_pg_cron_schedules.sql).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'email-digests-daily') then
    perform cron.unschedule('email-digests-daily');
  end if;
end $$;

select cron.schedule('email-digests-daily', '0 12 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_app_url')
           || '/api/cron/email-digests',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$);
