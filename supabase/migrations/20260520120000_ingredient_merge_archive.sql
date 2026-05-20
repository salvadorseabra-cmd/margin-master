-- Soft-archive merged duplicate ingredients (never hard-delete catalog rows).
alter table public.ingredients
  add column if not exists is_archived boolean not null default false,
  add column if not exists merged_into_ingredient_id uuid references public.ingredients (id) on delete restrict,
  add column if not exists merged_at timestamptz;

comment on column public.ingredients.is_archived is
  'True when this row was merged into another ingredient; kept for audit and FK history.';
comment on column public.ingredients.merged_into_ingredient_id is
  'Canonical ingredient id that absorbed this duplicate.';
comment on column public.ingredients.merged_at is
  'When the merge was applied.';

create index if not exists ingredients_merged_into_idx
  on public.ingredients (merged_into_ingredient_id)
  where merged_into_ingredient_id is not null;

create index if not exists ingredients_active_catalog_idx
  on public.ingredients (user_id, is_archived)
  where is_archived = false;
