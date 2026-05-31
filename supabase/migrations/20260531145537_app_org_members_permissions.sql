-- Granular RBAC: optional per-member permission override. NULL = use the
-- member's role defaults; a non-null array is the member's explicit permission
-- set (owners always have everything regardless).
alter table app.org_members
  add column if not exists permissions text[];

comment on column app.org_members.permissions is
  'Optional explicit permission set (keys from lib/permissions.ts). NULL = derive from role. Owners always have all permissions.';
