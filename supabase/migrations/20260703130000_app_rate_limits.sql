-- Fixed-window rate limiting for the app's authenticated surfaces.
--
-- One counter row per (bucket, window). Callers pass a bucket key like
-- "api:<key-id>" or "fn:nl-query:<user-id>", the window length, and the max
-- hits allowed per window; the function increments and reports whether the
-- caller is still under the limit. Service-role only — clients never talk to
-- it directly (the Next.js server and edge functions enforce the verdict).

create table if not exists app.rate_limit_counters (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

-- Default-deny for anon/authenticated; service_role bypasses RLS.
alter table app.rate_limit_counters enable row level security;

create or replace function app.rate_limit_hit(
  p_bucket text,
  p_max integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'app', 'public'
as $$
declare
  w_start timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  new_count integer;
begin
  insert into app.rate_limit_counters as c (bucket, window_start, count)
  values (p_bucket, w_start, 1)
  on conflict (bucket, window_start)
    do update set count = c.count + 1
  returning c.count into new_count;

  -- Opportunistic GC: expired windows are dead weight; ~1% of calls sweep them.
  if random() < 0.01 then
    delete from app.rate_limit_counters
    where window_start < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', new_count <= p_max,
    'remaining', greatest(p_max - new_count, 0),
    'retry_after', greatest(
      ceil(extract(epoch from
        (w_start + make_interval(secs => p_window_seconds) - now())))::int,
      1
    )
  );
end $$;

revoke all on function app.rate_limit_hit(text, integer, integer) from public;
revoke all on function app.rate_limit_hit(text, integer, integer) from anon;
revoke all on function app.rate_limit_hit(text, integer, integer) from authenticated;
grant execute on function app.rate_limit_hit(text, integer, integer) to service_role;
