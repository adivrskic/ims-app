-- Vault the pg_cron schedules for the three CRON_SECRET-guarded API routes.
--
-- These jobs were originally created out-of-band on the live project; this
-- migration is the reproducible source of truth. Idempotent: unschedules any
-- existing job with the same name before re-scheduling.
--
-- Prerequisites (NOT created here — secrets never belong in migrations):
--   vault secret 'cron_app_url'  — app origin, no trailing slash
--   vault secret 'cron_secret'   — must match the app host's CRON_SECRET env
-- Create them once per project:
--   select vault.create_secret('<value>', 'cron_app_url');
--   select vault.create_secret('<value>', 'cron_secret');

do $$
declare
  job record;
begin
  if (select count(*) from vault.decrypted_secrets
      where name in ('cron_app_url', 'cron_secret')) < 2 then
    raise warning 'cron_app_url / cron_secret vault secrets missing — cron jobs will 401 until created';
  end if;

  for job in
    select jobname from cron.job
    where jobname in ('stockout-alerts-daily', 'auto-draft-pos-daily', 'lot-expiry-alerts-daily')
  loop
    perform cron.unschedule(job.jobname);
  end loop;
end $$;

select cron.schedule('stockout-alerts-daily', '0 4 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_app_url')
           || '/api/cron/stockout-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$);

select cron.schedule('auto-draft-pos-daily', '0 4 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_app_url')
           || '/api/cron/auto-draft-pos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$);

select cron.schedule('lot-expiry-alerts-daily', '0 5 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_app_url')
           || '/api/cron/lot-expiry-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$);
