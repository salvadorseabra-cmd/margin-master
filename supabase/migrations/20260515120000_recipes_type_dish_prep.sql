-- Recipe kind: `dish` (final plate) vs `prep` (intermediate BOM; only `prep` in sub-recipe picker).
-- Existing rows receive default `dish`.

alter table public.recipes
  add column type text not null default 'dish'
    constraint recipes_type_check check (type in ('dish', 'prep'));
