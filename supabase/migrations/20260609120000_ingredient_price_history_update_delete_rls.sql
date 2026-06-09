-- Allow owners to reconcile price history after invoice delete (orphan cleanup + rechain).

create policy "ingredient_price_history_update_own"
  on public.ingredient_price_history
  for update
  using (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_price_history.ingredient_id
        and i.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_price_history.ingredient_id
        and i.user_id = auth.uid()
    )
  );

create policy "ingredient_price_history_delete_own"
  on public.ingredient_price_history
  for delete
  using (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_price_history.ingredient_id
        and i.user_id = auth.uid()
    )
  );
