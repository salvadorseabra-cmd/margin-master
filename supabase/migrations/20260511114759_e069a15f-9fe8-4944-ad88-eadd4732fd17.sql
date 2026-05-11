
-- Ingredients
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text not null default 'kg',
  current_price numeric not null default 0,
  supplier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ingredients enable row level security;
create policy "ingredients_select_own" on public.ingredients for select using (auth.uid() = user_id);
create policy "ingredients_insert_own" on public.ingredients for insert with check (auth.uid() = user_id);
create policy "ingredients_update_own" on public.ingredients for update using (auth.uid() = user_id);
create policy "ingredients_delete_own" on public.ingredients for delete using (auth.uid() = user_id);

-- Invoices
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier text not null,
  invoice_date date not null default current_date,
  total numeric not null default 0,
  status text not null default 'Processing',
  items_count int not null default 0,
  file_path text,
  created_at timestamptz not null default now()
);
alter table public.invoices enable row level security;
create policy "invoices_select_own" on public.invoices for select using (auth.uid() = user_id);
create policy "invoices_insert_own" on public.invoices for insert with check (auth.uid() = user_id);
create policy "invoices_update_own" on public.invoices for update using (auth.uid() = user_id);
create policy "invoices_delete_own" on public.invoices for delete using (auth.uid() = user_id);

-- Recipes
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Mains',
  price numeric not null default 0,
  cost numeric not null default 0,
  sold int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recipes enable row level security;
create policy "recipes_select_own" on public.recipes for select using (auth.uid() = user_id);
create policy "recipes_insert_own" on public.recipes for insert with check (auth.uid() = user_id);
create policy "recipes_update_own" on public.recipes for update using (auth.uid() = user_id);
create policy "recipes_delete_own" on public.recipes for delete using (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_ingredients_updated before update on public.ingredients
  for each row execute function public.set_updated_at();
create trigger trg_recipes_updated before update on public.recipes
  for each row execute function public.set_updated_at();

-- Storage bucket for invoice files (private)
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "invoice_files_select_own" on storage.objects for select
  using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "invoice_files_insert_own" on storage.objects for insert
  with check (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "invoice_files_update_own" on storage.objects for update
  using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "invoice_files_delete_own" on storage.objects for delete
  using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
