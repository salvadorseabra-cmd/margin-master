-- Restore per-user invoices and consistent child-table RLS.
-- Reverses the effect of 20260512100000_align_invoices_schema_and_rls.sql which dropped invoices.user_id
-- and used wide-open authenticated policies (cross-tenant reads/writes).

alter table public.invoices
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Prefer line-item owners when present (stable pick per invoice).
update public.invoices inv
set user_id = s.user_id
from (
  select distinct on (invoice_id) invoice_id, user_id
  from public.invoice_items
  order by invoice_id, created_at asc nulls last, id asc
) s
where inv.id = s.invoice_id
  and inv.user_id is null;

-- App convention: storage object key is "<auth uid>/<filename>"
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'file_url'
  ) then
    update public.invoices
    set user_id = split_part(file_url, '/', 1)::uuid
    where user_id is null
      and file_url is not null
      and split_part(file_url, '/', 1) ~ '^[0-9a-fA-F-]{36}$';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'file_path'
  ) then
    update public.invoices
    set user_id = split_part(file_path, '/', 1)::uuid
    where user_id is null
      and file_path is not null
      and split_part(file_path, '/', 1) ~ '^[0-9a-fA-F-]{36}$';
  end if;
end $$;

-- Remove orphaned lines then invoices with no resolvable owner.
delete from public.invoice_items
where invoice_id in (select id from public.invoices where user_id is null);

delete from public.invoices
where user_id is null;

alter table public.invoices
  alter column user_id set not null;

create index if not exists idx_invoices_user_id on public.invoices(user_id);

-- Align line owners with invoice owner (fixes mismatches after historical policy drift).
update public.invoice_items ii
set user_id = i.user_id
from public.invoices i
where i.id = ii.invoice_id
  and ii.user_id is distinct from i.user_id;

-- Invoices: drop permissive policies, then (re)create owner policies.
drop policy if exists "invoices_select_authenticated" on public.invoices;
drop policy if exists "invoices_insert_authenticated" on public.invoices;
drop policy if exists "invoices_update_authenticated" on public.invoices;
drop policy if exists "invoices_delete_authenticated" on public.invoices;

drop policy if exists "invoices_select_own" on public.invoices;
drop policy if exists "invoices_insert_own" on public.invoices;
drop policy if exists "invoices_update_own" on public.invoices;
drop policy if exists "invoices_delete_own" on public.invoices;

create policy "invoices_select_own"
  on public.invoices for select
  using (auth.uid() = user_id);

create policy "invoices_insert_own"
  on public.invoices for insert
  with check (auth.uid() = user_id);

create policy "invoices_update_own"
  on public.invoices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "invoices_delete_own"
  on public.invoices for delete
  using (auth.uid() = user_id);

-- invoice_items: require parent invoice owned by the same user (prevents cross-tenant invoice_id abuse).
drop policy if exists "items_select_own" on public.invoice_items;
drop policy if exists "items_insert_own" on public.invoice_items;
drop policy if exists "items_update_own" on public.invoice_items;
drop policy if exists "items_delete_own" on public.invoice_items;

create policy "items_select_own"
  on public.invoice_items for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.user_id = auth.uid()
    )
  );

create policy "items_insert_own"
  on public.invoice_items for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.user_id = auth.uid()
    )
  );

create policy "items_update_own"
  on public.invoice_items for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.user_id = auth.uid()
    )
  );

create policy "items_delete_own"
  on public.invoice_items for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.user_id = auth.uid()
    )
  );

-- recipe_ingredients: tie lines to parent recipe owner (same pattern as invoice_items).
drop policy if exists "recipe_ingredients_select_own" on public.recipe_ingredients;
drop policy if exists "recipe_ingredients_insert_own" on public.recipe_ingredients;
drop policy if exists "recipe_ingredients_update_own" on public.recipe_ingredients;
drop policy if exists "recipe_ingredients_delete_own" on public.recipe_ingredients;

create policy "recipe_ingredients_select_own"
  on public.recipe_ingredients for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  );

create policy "recipe_ingredients_insert_own"
  on public.recipe_ingredients for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  );

create policy "recipe_ingredients_update_own"
  on public.recipe_ingredients for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  );

create policy "recipe_ingredients_delete_own"
  on public.recipe_ingredients for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  );
