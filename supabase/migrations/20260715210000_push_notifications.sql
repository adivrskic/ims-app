-- Push notifications: device token registry + DB-side Expo push sender.
--
-- Pipeline: crons INSERT app.notifications (stockout, lot expiry, cycle-count
-- queue, digest events) → the send-push-notifications pg_cron job (every
-- minute) batches unpushed rows, joins each user's registered device tokens
-- and POSTs Expo push messages to https://exp.host/--/api/v2/push/send via
-- pg_net. The mobile app (hello-world2 lib/push.tsx) registers/removes
-- tokens; RLS restricts every user to their own rows. The Expo push API
-- needs no auth for standard sends, so no secret is required here.

create table if not exists app.user_push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

create index if not exists user_push_tokens_user_idx
  on app.user_push_tokens (user_id);

alter table app.user_push_tokens enable row level security;

drop policy if exists user_push_tokens_own on app.user_push_tokens;
create policy user_push_tokens_own on app.user_push_tokens
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on app.user_push_tokens to authenticated;
grant all on app.user_push_tokens to service_role;

-- Track which notifications have been handed to the push pipeline.
alter table app.notifications add column if not exists pushed_at timestamptz;

create index if not exists notifications_unpushed_idx
  on app.notifications (created_at)
  where pushed_at is null;

-- ---------------------------------------------------------------------------
-- Sender. SECURITY DEFINER because pg_cron runs it as postgres and it must
-- see all rows; EXECUTE is revoked from every client role. Rows are stamped
-- pushed_at inside the same statement that selects them (FOR UPDATE SKIP
-- LOCKED), so concurrent runs can't double-send. Notifications older than a
-- day are stamped without sending — a backlog of stale alerts arriving at
-- once helps nobody.
-- ---------------------------------------------------------------------------
create or replace function app.send_push_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msgs jsonb;
  v_count integer := 0;
  v_off integer := 0;
  v_chunk jsonb;
begin
  with due as (
    select n.id, n.user_id, n.title, n.body, n.link
    from app.notifications n
    where n.pushed_at is null
      and n.read_at is null
    order by n.created_at
    limit 200
    for update skip locked
  ),
  stamped as (
    update app.notifications x
    set pushed_at = now()
    from due
    where x.id = due.id
    returning due.user_id, due.title, due.body, due.link, x.created_at
  )
  select jsonb_agg(
           jsonb_build_object(
             'to', t.token,
             'title', s.title,
             'body', coalesce(s.body, ''),
             'sound', 'default',
             'channelId', 'default',
             'data', jsonb_build_object('link', s.link)
           )
         )
  into v_msgs
  from stamped s
  join app.user_push_tokens t on t.user_id = s.user_id
  where s.created_at > now() - interval '1 day';

  v_count := coalesce(jsonb_array_length(v_msgs), 0);
  if v_count = 0 then
    return 0;
  end if;

  -- Expo accepts at most 100 messages per request — send in chunks.
  while v_off < v_count loop
    select jsonb_agg(v_msgs -> i)
    into v_chunk
    from generate_series(v_off, least(v_off + 99, v_count - 1)) g (i);

    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := v_chunk
    );
    v_off := v_off + 100;
  end loop;

  return v_count;
end;
$$;

revoke all on function app.send_push_notifications() from public, anon, authenticated;
grant execute on function app.send_push_notifications() to service_role;

-- Every minute; the function is a fast no-op when nothing is pending.
select cron.schedule(
  'send-push-notifications',
  '* * * * *',
  $$select app.send_push_notifications()$$
);
