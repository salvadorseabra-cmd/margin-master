-- Sub-recipes as recipe_ingredients lines: each row references exactly one of
-- ingredient_id or sub_recipe_id (XOR). FK to recipes(id) uses ON DELETE RESTRICT
-- so deleting a recipe that is still referenced as a prep item / sub-recipe fails
-- (avoids silently dropping parent recipe cost data).

-- Old uniqueness (recipe_id, ingredient_id) disallows multiple NULL ingredient_id
-- and does not cover sub-recipe lines. Replace with partial unique indexes.
alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredients_recipe_id_ingredient_id_key;

create unique index if not exists recipe_ingredients_recipe_ingredient_uniq
  on public.recipe_ingredients (recipe_id, ingredient_id)
  where ingredient_id is not null;

alter table public.recipe_ingredients
  add column if not exists sub_recipe_id uuid references public.recipes (id) on delete restrict;

create unique index if not exists recipe_ingredients_recipe_sub_recipe_uniq
  on public.recipe_ingredients (recipe_id, sub_recipe_id)
  where sub_recipe_id is not null;

alter table public.recipe_ingredients
  alter column ingredient_id drop not null;

create index if not exists idx_recipe_ingredients_sub_recipe
  on public.recipe_ingredients (sub_recipe_id)
  where sub_recipe_id is not null;

alter table public.recipe_ingredients
  add constraint recipe_ingredients_one_target_chk
  check (
    (ingredient_id is not null)::int + (sub_recipe_id is not null)::int = 1
  );

-- Sub-recipe must belong to the same user as the parent recipe row.
-- CHECK cannot reference other tables via subqueries; enforce with a trigger.
create or replace function public.recipe_ingredients_enforce_sub_recipe_same_owner()
returns trigger
language plpgsql
as $$
begin
  if new.sub_recipe_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.recipes sr
    join public.recipes r on r.id = new.recipe_id
    where sr.id = new.sub_recipe_id
      and sr.user_id = r.user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'referenced sub-recipe must belong to same user as parent recipe';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recipe_ingredients_sub_recipe_same_owner on public.recipe_ingredients;
create trigger trg_recipe_ingredients_sub_recipe_same_owner
  before insert or update on public.recipe_ingredients
  for each row
  execute function public.recipe_ingredients_enforce_sub_recipe_same_owner();

-- RLS: keep parent recipe ownership; additionally require referenced sub-recipe to
-- belong to the same authenticated user (same as parent owner when parent is owned).
drop policy if exists "recipe_ingredients_select_own" on public.recipe_ingredients;
drop policy if exists "recipe_ingredients_insert_own" on public.recipe_ingredients;
drop policy if exists "recipe_ingredients_update_own" on public.recipe_ingredients;
drop policy if exists "recipe_ingredients_delete_own" on public.recipe_ingredients;

create policy "recipe_ingredients_select_own"
  on public.recipe_ingredients for select
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
    and (
      recipe_ingredients.sub_recipe_id is null
      or exists (
        select 1 from public.recipes sr
        where sr.id = recipe_ingredients.sub_recipe_id
          and sr.user_id = auth.uid()
      )
    )
  );

create policy "recipe_ingredients_insert_own"
  on public.recipe_ingredients for insert
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
    and (
      recipe_ingredients.sub_recipe_id is null
      or exists (
        select 1 from public.recipes sr
        where sr.id = recipe_ingredients.sub_recipe_id
          and sr.user_id = auth.uid()
      )
    )
  );

create policy "recipe_ingredients_update_own"
  on public.recipe_ingredients for update
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
    and (
      recipe_ingredients.sub_recipe_id is null
      or exists (
        select 1 from public.recipes sr
        where sr.id = recipe_ingredients.sub_recipe_id
          and sr.user_id = auth.uid()
      )
    )
  );

create policy "recipe_ingredients_delete_own"
  on public.recipe_ingredients for delete
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  );
