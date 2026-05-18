-- Restore persisted invoice dates for post-extraction invoice list rendering.
alter table public.invoices
  add column if not exists invoice_date date;
