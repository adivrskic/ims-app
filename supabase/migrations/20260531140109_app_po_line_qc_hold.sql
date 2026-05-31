-- Receiving depth: QC hold / quarantine on received PO lines.
-- Received goods can be held for inspection, then passed (cleared for putaway)
-- or failed (flagged for vendor return). Line-level state for v1.
alter table app.po_line_items
  add column if not exists qc_status text not null default 'none'
    check (qc_status in ('none','hold','passed','failed')),
  add column if not exists qc_notes text,
  add column if not exists qc_at timestamptz,
  add column if not exists qc_by uuid references auth.users(id) on delete set null;

comment on column app.po_line_items.qc_status is
  'Inbound QC state: none (no hold), hold (awaiting inspection), passed (cleared for putaway), failed (rejected — flag for vendor return).';

create index if not exists po_line_items_qc_hold_idx
  on app.po_line_items (qc_status) where qc_status = 'hold';
