-- Align invoices with live schema:
-- id, supplier_name, total, file_url, created_at
alter table if exists public.invoices
  add column if not exists supplier_name text;

alter table if exists public.invoices
  drop column if exists user_id,
  drop column if exists invoice_date,
  drop column if exists status,
  drop column if exists items_count,
  drop column if exists supplier;

alter table if exists public.invoices enable row level security;

drop policy if exists "invoices_select_own" on public.invoices;
drop policy if exists "invoices_insert_own" on public.invoices;
drop policy if exists "invoices_update_own" on public.invoices;
drop policy if exists "invoices_delete_own" on public.invoices;

create policy "invoices_select_authenticated"
  on public.invoices
  for select
  to authenticated
  using (true);

create policy "invoices_insert_authenticated"
  on public.invoices
  for insert
  to authenticated
  with check (true);

create policy "invoices_update_authenticated"
  on public.invoices
  for update
  to authenticated
  using (true)
  with check (true);

create policy "invoices_delete_authenticated"
  on public.invoices
  for delete
  to authenticated
  using (true);
