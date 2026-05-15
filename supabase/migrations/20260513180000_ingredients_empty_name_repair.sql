-- Repair junk ingredient rows (bad sync used wrong column / empty names).
-- Detach recipe_ingredients first so FK does not block deletes.

delete from public.recipe_ingredients ri
using public.ingredients i
where ri.ingredient_id = i.id
  and (
    i.name is null
    or btrim(coalesce(i.name, '')) = ''
    or lower(btrim(coalesce(i.name, ''))) = 'unknown'
  );

delete from public.ingredients i
where i.name is null
  or btrim(coalesce(i.name, '')) = ''
  or lower(btrim(coalesce(i.name, ''))) = 'unknown';
