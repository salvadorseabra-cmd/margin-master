-- Per-line unit on recipe ingredients (typically matches ingredient purchase unit at save time).
alter table public.recipe_ingredients
  add column if not exists unit text;

update public.recipe_ingredients ri
set unit = i.unit
from public.ingredients i
where ri.ingredient_id = i.id
  and (ri.unit is null or btrim(ri.unit) = '');

update public.recipe_ingredients
set unit = 'kg'
where unit is null or btrim(unit) = '';

alter table public.recipe_ingredients
  alter column unit set not null,
  alter column unit set default 'kg';
