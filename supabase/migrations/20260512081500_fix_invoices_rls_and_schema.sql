-- Ensure invoices RLS is enabled and owner policies exist for the live schema.
alter table if exists public.invoices enable row level security;

do $$
declare
  owner_column text;
begin
  select c.column_name
    into owner_column
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'invoices'
    and c.column_name in ('user_id', 'owner_id', 'created_by')
  order by case c.column_name
    when 'user_id' then 1
    when 'owner_id' then 2
    when 'created_by' then 3
    else 99
  end
  limit 1;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_select_own'
  ) then
    execute 'drop policy "invoices_select_own" on public.invoices';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_insert_own'
  ) then
    execute 'drop policy "invoices_insert_own" on public.invoices';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_update_own'
  ) then
    execute 'drop policy "invoices_update_own" on public.invoices';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_delete_own'
  ) then
    execute 'drop policy "invoices_delete_own" on public.invoices';
  end if;

  if owner_column is not null then
    execute format(
      'create policy "invoices_select_own" on public.invoices for select using (auth.uid() = %I)',
      owner_column
    );
    execute format(
      'create policy "invoices_insert_own" on public.invoices for insert with check (auth.uid() = %I)',
      owner_column
    );
    execute format(
      'create policy "invoices_update_own" on public.invoices for update using (auth.uid() = %I)',
      owner_column
    );
    execute format(
      'create policy "invoices_delete_own" on public.invoices for delete using (auth.uid() = %I)',
      owner_column
    );
  else
    create policy "invoices_select_own"
      on public.invoices for select
      using (auth.uid() is not null);
    create policy "invoices_insert_own"
      on public.invoices for insert
      with check (auth.uid() is not null);
    create policy "invoices_update_own"
      on public.invoices for update
      using (auth.uid() is not null);
    create policy "invoices_delete_own"
      on public.invoices for delete
      using (auth.uid() is not null);
  end if;
end;
$$;
