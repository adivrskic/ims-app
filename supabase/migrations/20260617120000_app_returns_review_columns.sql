-- Returns review flow: capture who signed off a return and any review note.
-- `reviewed_at` and `disposition` already exist on app.returns; this adds the
-- reviewer id + free-text note so the desk review action has somewhere to land.
-- Idempotent (IF NOT EXISTS) so it's safe to re-run.

alter table app.returns
  add column if not exists reviewed_by uuid,
  add column if not exists review_notes text;

comment on column app.returns.reviewed_by is
  'Profile/user id who dispositioned this return at the desk (returns review flow).';
comment on column app.returns.review_notes is
  'Optional note captured when a return was reviewed/dispositioned.';
