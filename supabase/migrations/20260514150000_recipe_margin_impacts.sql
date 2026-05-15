-- Audit trail for recipe margin changes tied to ingredient cost updates.
-- Append-only audit rows: only created_at (no updated_at) so the table matches app types in src/integrations/supabase/types.ts.

create table public.recipe_margin_impacts (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  old_recipe_cost numeric not null,
  new_recipe_cost numeric not null,
  old_margin_pct numeric not null,
  new_margin_pct numeric not null,
  margin_delta_pct numeric not null,
  estimated_monthly_loss numeric,
  impact_level text,
  created_at timestamptz not null default now()
);

create index idx_recipe_margin_impacts_recipe_id
  on public.recipe_margin_impacts(recipe_id);

create index idx_recipe_margin_impacts_ingredient_id
  on public.recipe_margin_impacts(ingredient_id);

create index idx_recipe_margin_impacts_created_at
  on public.recipe_margin_impacts(created_at desc);

alter table public.recipe_margin_impacts enable row level security;

create policy "recipe_margin_impacts_select_own"
  on public.recipe_margin_impacts
  for select
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_margin_impacts.recipe_id
        and r.user_id = auth.uid()
    )
  );

create policy "recipe_margin_impacts_insert_own"
  on public.recipe_margin_impacts
  for insert
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_margin_impacts.recipe_id
        and r.user_id = auth.uid()
    )
  );
