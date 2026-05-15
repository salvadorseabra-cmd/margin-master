-- Normalized ingredient name for dedupe on invoice sync (mirrors app normalizeIngredientName as closely as practical).
create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

alter table public.ingredients
  add column if not exists normalized_name text;

-- One-shot helper for migration backfill only.
create or replace function public._migrate_compute_ingredient_normalized_name(p_input text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  lower(extensions.unaccent(coalesce(p_input, ''))),
                  '\d{1,3}(,\d{3})+', ' ', 'g'
                ),
                '\d+\.\d+', ' ', 'g'
              ),
              '\d+', ' ', 'g'
            ),
            '\m(ml|mg|kg|cx|un|und|lt|lbs|lb|oz|pcs|pc|g|l)\M', ' ', 'gi'
          ),
          '[^a-z\s]+', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

update public.ingredients
set normalized_name = public._migrate_compute_ingredient_normalized_name(name)
where normalized_name is distinct from public._migrate_compute_ingredient_normalized_name(name);

drop function if exists public._migrate_compute_ingredient_normalized_name(text);

create index if not exists ingredients_user_normalized_name_idx
  on public.ingredients (user_id, normalized_name);
