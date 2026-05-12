-- Adds POC KPI / commercial commitment fields used by proposal, agreement, and invoice previews/conversion.

alter table public.proposals
  add column if not exists poc_success_kpis text,
  add column if not exists poc_conversion_commitment text;

alter table public.agreements
  add column if not exists poc_success_kpis text,
  add column if not exists poc_conversion_commitment text;

alter table public.invoices
  add column if not exists poc_success_kpis text,
  add column if not exists poc_conversion_commitment text;
