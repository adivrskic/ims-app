-- Device/session tracking for Settings → Security "Active devices".
--
-- One row per (user, device-cookie). The middleware mints a stable `nb_device`
-- cookie; the app layout upserts last_seen on each navigation and checks
-- revoked_at. Revoking a row from another device forces that device to sign out
-- on its next page load (eventual remote sign-out).

create table if not exists app.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id text not null,
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, device_id)
);

create index if not exists user_sessions_user_idx
  on app.user_sessions (user_id);

-- Accessed exclusively via the service-role client (filtered by user_id), like
-- the cron/notification paths — enable RLS with no policies so the anon/auth
-- clients can't read it directly.
alter table app.user_sessions enable row level security;
