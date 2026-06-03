-- Add editable custom invoice terms and manual schedule metadata.
alter table if exists public.invoices
  add column if not exists payment_terms_custom text,
  add column if not exists payment_schedule_mode text not null default 'auto';

alter table if exists public.invoices
  drop constraint if exists invoices_payment_schedule_mode_check;

alter table if exists public.invoices
  add constraint invoices_payment_schedule_mode_check
  check (payment_schedule_mode in ('auto', 'manual'));

alter table if exists public.invoice_payment_schedule
  add column if not exists payment_percent numeric(8,2) not null default 0;
