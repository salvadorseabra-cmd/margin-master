
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  unit_price numeric,
  total numeric,
  created_at timestamptz not null default now()
);
create index idx_invoice_items_invoice on public.invoice_items(invoice_id);
alter table public.invoice_items enable row level security;
create policy "items_select_own" on public.invoice_items for select using (auth.uid() = user_id);
create policy "items_insert_own" on public.invoice_items for insert with check (auth.uid() = user_id);
create policy "items_update_own" on public.invoice_items for update using (auth.uid() = user_id);
create policy "items_delete_own" on public.invoice_items for delete using (auth.uid() = user_id);
