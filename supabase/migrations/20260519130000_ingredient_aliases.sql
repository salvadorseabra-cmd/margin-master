-- Canonical ingredient alias memory (lookup by normalized alias per ingredient).

create table public.ingredient_aliases (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  alias_name text not null,
  normalized_alias text not null,
  supplier_name text,
  confidence numeric not null default 1,
  confirmed_by_user boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_ingredient_aliases_ingredient_id
  on public.ingredient_aliases(ingredient_id);

create index idx_ingredient_aliases_normalized_alias
  on public.ingredient_aliases(normalized_alias);

alter table public.ingredient_aliases enable row level security;

create policy "ingredient_aliases_select_own"
  on public.ingredient_aliases
  for select
  using (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_aliases.ingredient_id
        and i.user_id = auth.uid()
    )
  );

create policy "ingredient_aliases_insert_own"
  on public.ingredient_aliases
  for insert
  with check (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_aliases.ingredient_id
        and i.user_id = auth.uid()
    )
  );

create policy "ingredient_aliases_update_own"
  on public.ingredient_aliases
  for update
  using (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_aliases.ingredient_id
        and i.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_aliases.ingredient_id
        and i.user_id = auth.uid()
    )
  );

create policy "ingredient_aliases_delete_own"
  on public.ingredient_aliases
  for delete
  using (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_aliases.ingredient_id
        and i.user_id = auth.uid()
    )
  );
