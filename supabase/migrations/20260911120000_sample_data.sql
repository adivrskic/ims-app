-- Sample data marker.
--
-- "Explore with sample data" (overview getting-started card / empty inventory)
-- seeds a realistic, industry-appropriate demo set: categories, suppliers,
-- customers, sections, products with on-hand stock, a purchase order in
-- transit, two open orders and two weeks of scan activity. The ids of every
-- row it created are kept here so "Clear sample data" removes exactly those
-- rows and nothing the customer added themselves. Null = no sample data.
alter table app.orgs
  add column if not exists sample_data jsonb;

comment on column app.orgs.sample_data is
  'Present while demo data is loaded: {version, seeded_at, seeded_by, warehouse_id, ids:{categories[], suppliers[], customers[], sections[], products[], purchase_orders[], orders[], scans[]}}. Null otherwise.';
