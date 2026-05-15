-- Purchase-pack vs recipe (base) unit: pack price / pack size × recipe qty.
alter table public.ingredients
  add column if not exists purchase_quantity numeric,
  add column if not exists purchase_unit text,
  add column if not exists base_unit text;

update public.ingredients
set purchase_quantity = 1
where purchase_quantity is null;

alter table public.ingredients
  alter column purchase_quantity set default 1,
  alter column purchase_quantity set not null;

update public.ingredients
set purchase_unit = unit
where purchase_unit is null;

update public.ingredients
set base_unit = coalesce(nullif(btrim(base_unit), ''), nullif(btrim(unit), ''))
where base_unit is null or btrim(base_unit) = '';
