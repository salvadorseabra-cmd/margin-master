-- Distinguish human-facing catalog rows from invoice/OCR shorthand rows.
alter table public.ingredients
  add column if not exists ingredient_kind text not null default 'canonical';

alter table public.ingredients
  drop constraint if exists ingredients_ingredient_kind_check;

alter table public.ingredients
  add constraint ingredients_ingredient_kind_check
  check (ingredient_kind in ('canonical', 'alias'));

comment on column public.ingredients.ingredient_kind is
  'canonical = operational catalog row; alias = invoice shorthand absorbed into alias memory / merge.';

create index if not exists ingredients_user_canonical_kind_idx
  on public.ingredients (user_id, ingredient_kind)
  where ingredient_kind = 'canonical' and is_archived = false;
