-- Harden the legacy public helper functions that use UNQUALIFIED table names.
--
-- get_warehouse_stats (called live by the mobile app's KPI strip),
-- get_product_stock, and search_products all reference `locations`, `products`,
-- etc. without a schema and with no pinned search_path — so their behavior
-- depended entirely on the caller's search_path. After the legacy `public`
-- duplicate tables were moved to the `legacy` schema, these were one
-- public-only-search_path call away from breaking.
--
-- Pin them to `app, public` so they deterministically resolve to the real `app`
-- tables (which is the data the mobile app already wants), and clear the
-- corresponding function_search_path_mutable advisor warnings.

alter function public.get_warehouse_stats(uuid) set search_path = app, public;
alter function public.get_product_stock(uuid, uuid) set search_path = app, public;
alter function public.search_products(text, uuid) set search_path = app, public;
