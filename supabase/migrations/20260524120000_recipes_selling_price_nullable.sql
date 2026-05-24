-- Prep recipes may omit menu selling price; dishes still require it in app validation.
-- Legacy column was `price`; app reads `selling_price`.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipes'
      and column_name = 'price'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipes'
      and column_name = 'selling_price'
  ) then
    alter table public.recipes rename column price to selling_price;
  end if;
end $$;

alter table public.recipes
  alter column selling_price drop not null;

alter table public.recipes
  alter column selling_price drop default;
