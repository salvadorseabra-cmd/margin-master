-- Recipe line items: quantities per ingredient for a recipe (per user).

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_ingredients_recipe_id_ingredient_id_key unique (recipe_id, ingredient_id)
);

create index if not exists idx_recipe_ingredients_recipe on public.recipe_ingredients(recipe_id);
create index if not exists idx_recipe_ingredients_ingredient on public.recipe_ingredients(ingredient_id);

alter table public.recipe_ingredients enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'recipe_ingredients'
      and policyname = 'recipe_ingredients_select_own'
  ) then
    create policy "recipe_ingredients_select_own"
      on public.recipe_ingredients for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'recipe_ingredients'
      and policyname = 'recipe_ingredients_insert_own'
  ) then
    create policy "recipe_ingredients_insert_own"
      on public.recipe_ingredients for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'recipe_ingredients'
      and policyname = 'recipe_ingredients_update_own'
  ) then
    create policy "recipe_ingredients_update_own"
      on public.recipe_ingredients for update
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'recipe_ingredients'
      and policyname = 'recipe_ingredients_delete_own'
  ) then
    create policy "recipe_ingredients_delete_own"
      on public.recipe_ingredients for delete
      using (auth.uid() = user_id);
  end if;
end;
$$;

create trigger trg_recipe_ingredients_updated
  before update on public.recipe_ingredients
  for each row execute function public.set_updated_at();
