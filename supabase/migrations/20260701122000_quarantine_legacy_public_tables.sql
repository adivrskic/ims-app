-- M6: quarantine the legacy `public`-schema WMS tables.
--
-- These are leftovers from before the WMS moved to the `app` schema. Confirmed
-- dead: no app code references the public schema (every Supabase client is
-- pinned to `app`), the marketing/chatbot app uses a disjoint set of public
-- tables (chat_*, article_feedback, kb_chunks, form_submissions), there are no
-- cross-schema FKs, no tracked dependent views, and only trivial stale seed rows.
--
-- Move them OUT of the API-exposed `public` schema into `legacy` rather than
-- DROP: reversible, preserves the data, and still de-exposes them from PostgREST
-- and clears the associated public-schema advisor lints. Drop the whole `legacy`
-- schema later once you're satisfied nothing needs it:  drop schema legacy cascade;

-- NOTE: public.profiles is deliberately NOT moved. A live trigger on auth.users
-- (on_auth_user_created -> public.handle_new_user) still INSERTs into
-- public.profiles on every signup; moving it makes that SECURITY DEFINER trigger
-- error and fail the signup transaction. Retiring public.profiles requires first
-- reworking/removing that trigger (the WMS reads app.profiles, populated during
-- onboarding, so the trigger is vestigial — but that's a separate change).

create schema if not exists legacy;

alter table public.products         set schema legacy;
alter table public.orders           set schema legacy;
alter table public.order_items      set schema legacy;
alter table public.locations        set schema legacy;
alter table public.warehouses       set schema legacy;
alter table public.warehouse_access set schema legacy;
alter table public.organizations    set schema legacy;
alter table public.org_members      set schema legacy;
alter table public.org_invites      set schema legacy;
alter table public.categories       set schema legacy;
alter table public.sections         set schema legacy;
alter table public.scan_history     set schema legacy;
alter table public.purchase_orders  set schema legacy;
alter table public.po_line_items    set schema legacy;
alter table public.returns          set schema legacy;
alter table public.layout_snapshots set schema legacy;
