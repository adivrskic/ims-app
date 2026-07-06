-- Fix broken PostgREST profile embeds (found during the 2026-07-03 browser pass).
--
-- Three pages embed profiles through FK hints — orders detail
-- (assignee:profiles!orders_assigned_to_fkey), cycle-counts history
-- (counter:profiles!cycle_counts_counted_by_fkey), and returns
-- (receiver:profiles!returns_received_by_fkey) — but those FKs reference
-- auth.users, which PostgREST cannot resolve to app.profiles, so every such
-- query errored ("Could not find a relationship") and the callers swallowed
-- it: the ORDER DETAIL PAGE 404'd for every order, and the other two lists
-- silently rendered empty.
--
-- Standard Supabase fix: point the FKs at app.profiles(id) instead.
-- profiles.id IS auth.users.id (PK + FK with cascade), so integrity is
-- preserved; ON DELETE SET NULL lets audit rows survive a user deletion
-- (previously NO ACTION would have blocked it). Orphan check ran clean
-- before this migration.

alter table app.orders
  drop constraint orders_assigned_to_fkey,
  add constraint orders_assigned_to_fkey
    foreign key (assigned_to) references app.profiles(id) on delete set null;

alter table app.cycle_counts
  drop constraint cycle_counts_counted_by_fkey,
  add constraint cycle_counts_counted_by_fkey
    foreign key (counted_by) references app.profiles(id) on delete set null;

alter table app.returns
  drop constraint returns_received_by_fkey,
  add constraint returns_received_by_fkey
    foreign key (received_by) references app.profiles(id) on delete set null;
