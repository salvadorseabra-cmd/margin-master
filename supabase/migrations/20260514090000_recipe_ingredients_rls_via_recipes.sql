-- recipe_ingredients RLS: parent recipe ownership only (no recipe_ingredients.user_id).
-- Replaces policies that referenced recipe_ingredients.user_id (column absent on some remotes).

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
  );

create policy "recipe_ingredients_insert_own"
  on public.recipe_ingredients for insert
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
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
