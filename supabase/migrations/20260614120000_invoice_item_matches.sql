-- Match Lifecycle V1 Phase 0: persisted per-line match source-of-truth container.
-- Additive-only; no app wiring until later phases.

create table public.invoice_item_matches (
  invoice_item_id uuid primary key references public.invoice_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  status text not null,
  match_kind text,
  confirmed_at timestamptz,
  corrected_at timestamptz,
  previous_ingredient_id uuid references public.ingredients(id) on delete set null,
  pack_variant_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_iim_status_values
    check (status in ('unmatched', 'suggested', 'confirmed')),
  constraint chk_iim_unmatched_no_ingredient
    check (status != 'unmatched' or ingredient_id is null),
  constraint chk_iim_confirmed_has_ingredient
    check (status != 'confirmed' or ingredient_id is not null),
  constraint chk_iim_confirmed_has_timestamp
    check (status != 'confirmed' or confirmed_at is not null)
);

create index idx_iim_user_id
  on public.invoice_item_matches(user_id);

create index idx_iim_invoice_id
  on public.invoice_item_matches(invoice_id);

create index idx_iim_ingredient_status
  on public.invoice_item_matches(ingredient_id, status)
  where ingredient_id is not null;

create index idx_iim_status
  on public.invoice_item_matches(status)
  where status = 'suggested';

create index idx_iim_pack_variant
  on public.invoice_item_matches(pack_variant_id)
  where pack_variant_id is not null;

alter table public.invoice_item_matches enable row level security;

create policy "invoice_item_matches_select_own"
  on public.invoice_item_matches
  for select
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.invoice_items ii
      where ii.id = invoice_item_matches.invoice_item_id
        and ii.user_id = auth.uid()
    )
  );

create policy "invoice_item_matches_insert_own"
  on public.invoice_item_matches
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.invoice_items ii
      where ii.id = invoice_item_matches.invoice_item_id
        and ii.user_id = auth.uid()
        and ii.invoice_id = invoice_item_matches.invoice_id
    )
    and exists (
      select 1
      from public.invoices i
      where i.id = invoice_item_matches.invoice_id
        and i.user_id = auth.uid()
    )
  );

create policy "invoice_item_matches_update_own"
  on public.invoice_item_matches
  for update
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.invoice_items ii
      where ii.id = invoice_item_matches.invoice_item_id
        and ii.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.invoice_items ii
      where ii.id = invoice_item_matches.invoice_item_id
        and ii.user_id = auth.uid()
        and ii.invoice_id = invoice_item_matches.invoice_id
    )
    and exists (
      select 1
      from public.invoices i
      where i.id = invoice_item_matches.invoice_id
        and i.user_id = auth.uid()
    )
  );

create policy "invoice_item_matches_delete_own"
  on public.invoice_item_matches
  for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.invoice_items ii
      where ii.id = invoice_item_matches.invoice_item_id
        and ii.user_id = auth.uid()
    )
  );

create trigger trg_invoice_item_matches_updated
  before update on public.invoice_item_matches
  for each row execute function public.set_updated_at();
