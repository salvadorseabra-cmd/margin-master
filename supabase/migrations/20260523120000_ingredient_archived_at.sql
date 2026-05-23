-- When a canonical ingredient is operationally archived (not merged away).
alter table public.ingredients
  add column if not exists archived_at timestamptz;

comment on column public.ingredients.archived_at is
  'Set when the user archives an ingredient from the active catalog; cleared on restore.';

create index if not exists ingredients_user_archived_at_idx
  on public.ingredients (user_id, archived_at desc nulls last)
  where is_archived = true and merged_into_ingredient_id is null;
