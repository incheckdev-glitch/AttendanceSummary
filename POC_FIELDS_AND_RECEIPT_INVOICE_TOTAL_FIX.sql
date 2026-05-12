-- Adds POC metadata fields used by proposal -> agreement -> invoice conversion.
-- Receipt fix is code-side: receipts.js no longer selects invoices.grand_total.

alter table public.proposals
  add column if not exists is_poc boolean not null default false,
  add column if not exists poc_location_count integer,
  add column if not exists poc_license_count integer,
  add column if not exists poc_license_months numeric(10,2),
  add column if not exists poc_service_start_date date,
  add column if not exists poc_service_end_date date;

alter table public.agreements
  add column if not exists is_poc boolean not null default false,
  add column if not exists poc_location_count integer,
  add column if not exists poc_license_count integer,
  add column if not exists poc_license_months numeric(10,2),
  add column if not exists poc_service_start_date date,
  add column if not exists poc_service_end_date date;

alter table public.invoices
  add column if not exists is_poc boolean not null default false,
  add column if not exists poc_location_count integer,
  add column if not exists poc_license_count integer,
  add column if not exists poc_license_months numeric(10,2),
  add column if not exists poc_service_start_date date,
  add column if not exists poc_service_end_date date;
