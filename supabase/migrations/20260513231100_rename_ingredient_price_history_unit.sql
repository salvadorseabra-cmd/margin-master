-- Align legacy installs: initial migration used `unit`; app + remote DB use `ingredient_unit`.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ingredient_price_history'
      and column_name = 'unit'
  ) then
    alter table public.ingredient_price_history rename column unit to ingredient_unit;
  end if;
end;
$$;
