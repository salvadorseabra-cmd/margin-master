-- Persist invoice settlement state for the invoices list UI.
-- Apply this migration before the frontend selects settlement_status.

alter table public.invoices
  add column if not exists settlement_status text not null default 'pending';

alter table public.invoices
  drop constraint if exists invoices_settlement_status_check;

-- Normalize legacy value from an earlier draft that used 'awaiting'.
update public.invoices
  set settlement_status = 'pending'
  where settlement_status = 'awaiting';

alter table public.invoices
  alter column settlement_status set default 'pending';

alter table public.invoices
  add constraint invoices_settlement_status_check
  check (settlement_status in ('pending', 'settled'));
