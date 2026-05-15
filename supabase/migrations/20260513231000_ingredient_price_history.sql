-- Price audit trail when invoice sync updates ingredient unit costs.

create table public.ingredient_price_history (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  ingredient_name text not null,
  supplier_name text,
  ingredient_unit text,
  previous_price numeric,
  new_price numeric not null,
  delta numeric,
  delta_percent numeric,
  created_at timestamptz not null default now()
);

create index idx_ingredient_price_history_ingredient_id
  on public.ingredient_price_history(ingredient_id);

create index idx_ingredient_price_history_ingredient_created
  on public.ingredient_price_history(ingredient_id, created_at desc);

alter table public.ingredient_price_history enable row level security;

create policy "ingredient_price_history_select_own"
  on public.ingredient_price_history
  for select
  using (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_price_history.ingredient_id
        and i.user_id = auth.uid()
    )
  );

create policy "ingredient_price_history_insert_own"
  on public.ingredient_price_history
  for insert
  with check (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_price_history.ingredient_id
        and i.user_id = auth.uid()
    )
    and (
      ingredient_price_history.invoice_id is null
      or exists (
        select 1
        from public.invoices inv
        where inv.id = ingredient_price_history.invoice_id
          and inv.user_id = auth.uid()
      )
    )
  );
