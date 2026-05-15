-- Canonical name for cross-supplier ingredient dedupe (see src/lib/ingredient-canonical.ts).
create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

alter table public.ingredients
  add column if not exists canonical_name text;

-- One-shot helper for migration backfill only (approximates TS normalizeCanonicalIngredientName).
create or replace function public._migrate_compute_ingredient_canonical(p_input text)
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
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        lower(extensions.unaccent(coalesce(p_input, ''))),
                        '[^a-z0-9]+', ' ', 'gi'
                      ),
                      '[[:<:]]pack[[:space:]]*[0-9]+', ' ', 'gi'
                    ),
                    '[[:<:]]x[[:space:]]*[0-9]+', ' ', 'gi'
                  ),
                  '[[:<:]][0-9]+[[:space:]]*un[[:>:]]', ' ', 'gi'
                ),
                '[[:<:]][0-9]+un[[:>:]]', ' ', 'gi'
              ),
              '[[:<:]](kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|unid|unids|cx|caixa|pc|pcs|und|unds)[[:>:]]', ' ', 'gi'
            ),
            '[[:<:]][0-9]+[[:>:]]', ' ', 'g'
          ),
          '[[:<:]]coke[[:>:]]', 'coca cola', 'gi'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

update public.ingredients
set canonical_name = public._migrate_compute_ingredient_canonical(name)
where canonical_name is null
   or canonical_name is distinct from public._migrate_compute_ingredient_canonical(name);

drop function if exists public._migrate_compute_ingredient_canonical(text);

create index if not exists ingredients_user_canonical_name_idx
  on public.ingredients (user_id, canonical_name)
  where canonical_name is not null;
