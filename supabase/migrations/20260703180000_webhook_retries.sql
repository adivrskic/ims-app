-- Webhook retry v2: queue + exponential backoff.
--
-- deliverWebhook (lib/integrations/webhooks.ts) schedules a first retry
-- 15 minutes after a failed delivery by stamping next_retry_at on the
-- webhook_deliveries row. The /api/cron/webhook-retries route (scheduled
-- below) re-attempts due rows with backoff 15m -> 1h -> 4h -> 12h and gives
-- up after 5 total attempts. Deliveries that failed before any HTTP was
-- attempted (SSRF-blocked / decrypt failures, logged with an empty
-- request_body) are never scheduled and are skipped defensively by the cron.
--
-- attempts     — total delivery attempts so far (the original send = 1)
-- next_retry_at — when the cron should re-attempt; NULL = nothing pending
--                (succeeded, gave up, or was never retryable)
-- retried_at   — when the most recent RE-attempt ran (NULL until first retry;
--                delivered_at keeps the original send time)

alter table app.webhook_deliveries
  add column if not exists attempts integer not null default 1,
  add column if not exists next_retry_at timestamptz,
  add column if not exists retried_at timestamptz;

-- The cron's work-list scan: only pending-retry rows are indexed, so the
-- index stays tiny no matter how large the delivery log grows.
create index if not exists webhook_deliveries_retry_due_idx
  on app.webhook_deliveries (next_retry_at)
  where succeeded = false and next_retry_at is not null;

-- ─── pg_cron schedule ────────────────────────────────────────────────
-- Same vault-secret pattern as 20260703121000_pg_cron_schedules.sql.
-- Prerequisites (NOT created here — secrets never belong in migrations):
--   vault secret 'cron_app_url'  — app origin, no trailing slash
--   vault secret 'cron_secret'   — must match the app host's CRON_SECRET env
-- Idempotent: unschedules any existing job with the same name first.

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
    where jobname = 'webhook-retries'
  loop
    perform cron.unschedule(job.jobname);
  end loop;
end $$;

select cron.schedule('webhook-retries', '*/15 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_app_url')
           || '/api/cron/webhook-retries',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$);
