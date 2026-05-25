-- Prep batch output (e.g. 250 ml sauce, 1 kg pickle mix). Used for unit cost when prep is used as a sub-recipe line.

alter table public.recipes
  add column if not exists output_quantity numeric,
  add column if not exists output_unit text;

comment on column public.recipes.output_quantity is 'Prep batch size denominator for unit cost (e.g. 250 for 250 ml).';
comment on column public.recipes.output_unit is 'Unit label for prep batch output (e.g. ml, kg). No conversion — must match usage lines manually.';
