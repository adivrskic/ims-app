-- Slotting (#8) prerequisite: a per-section capacity ceiling per slot.
-- NULL = unlimited / unknown -> slotting treats capacity as a soft factor only.
alter table app.sections
  add column if not exists slot_capacity integer;

comment on column app.sections.slot_capacity is
  'Max units a single (bay, level) slot in this section can hold. NULL = unlimited/unknown; slotting engine treats capacity as a soft factor when null. Used by directed putaway / slotting (#8).';

alter table app.sections
  add constraint sections_slot_capacity_positive
  check (slot_capacity is null or slot_capacity > 0);
