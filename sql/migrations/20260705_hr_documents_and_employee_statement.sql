-- InCheck360 ERP
-- HR Documents PDF Upload + Employee Statement of Account
-- Migration: 20260705_hr_documents_and_employee_statement.sql
-- Safe to re-run.
-- Run after: 20260703_full_hr_module.sql

create extension if not exists pgcrypto;

-- =========================================================
-- 1) HR DOCUMENTS: PDF metadata support
-- =========================================================

-- Create the HR documents table only if it does not already exist.
create table if not exists public.hr_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  document_type text not null default 'Other',
  document_name text,
  document_title text,
  issue_date date,
  expiry_date date,
  notes text,
  file_url text,
  file_name text,
  file_path text,
  file_mime_type text,
  file_size bigint,
  uploaded_at timestamptz,
  uploaded_by uuid,
  status text not null default 'valid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add missing columns safely if the table already existed.
alter table public.hr_documents add column if not exists document_type text not null default 'Other';
alter table public.hr_documents add column if not exists document_name text;
alter table public.hr_documents add column if not exists document_title text;
alter table public.hr_documents add column if not exists issue_date date;
alter table public.hr_documents add column if not exists expiry_date date;
alter table public.hr_documents add column if not exists notes text;
alter table public.hr_documents add column if not exists file_url text;
alter table public.hr_documents add column if not exists file_name text;
alter table public.hr_documents add column if not exists file_path text;
alter table public.hr_documents add column if not exists file_mime_type text;
alter table public.hr_documents add column if not exists file_size bigint;
alter table public.hr_documents add column if not exists uploaded_at timestamptz;
alter table public.hr_documents add column if not exists uploaded_by uuid;
alter table public.hr_documents add column if not exists status text not null default 'valid';
alter table public.hr_documents add column if not exists created_at timestamptz not null default now();
alter table public.hr_documents add column if not exists updated_at timestamptz not null default now();

-- Keep old/new naming compatible.
update public.hr_documents
set document_title = coalesce(nullif(document_title, ''), nullif(document_name, ''), document_type, 'Employee Document'),
    document_name = coalesce(nullif(document_name, ''), nullif(document_title, ''), document_type, 'Employee Document'),
    updated_at = now()
where document_title is null or document_title = '' or document_name is null or document_name = '';

-- Status check: valid / missing / expired.
do $$
begin
  alter table public.hr_documents drop constraint if exists hr_documents_status_check;
  alter table public.hr_documents add constraint hr_documents_status_check
    check (status in ('valid','missing','expired'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_hr_documents_employee_id on public.hr_documents(employee_id);
create index if not exists idx_hr_documents_expiry_date on public.hr_documents(expiry_date);
create index if not exists idx_hr_documents_file_path on public.hr_documents(file_path);
create index if not exists idx_hr_documents_uploaded_at on public.hr_documents(uploaded_at);

-- updated_at helper for HR documents.
create or replace function public.hr_documents_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_hr_documents_touch_updated_at'
  ) then
    create trigger trg_hr_documents_touch_updated_at
    before update on public.hr_documents
    for each row
    execute function public.hr_documents_touch_updated_at();
  end if;
end $$;

-- =========================================================
-- 2) Supabase Storage bucket for PDF documents
-- =========================================================

-- Bucket: private, 10MB limit. Frontend should also enforce application/pdf only.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('hr-employee-documents', 'hr-employee-documents', false)
    on conflict (id) do update
      set public = false;

    -- These columns exist on most modern Supabase projects, but are checked safely.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'storage'
        and table_name = 'buckets'
        and column_name = 'file_size_limit'
    ) then
      update storage.buckets
      set file_size_limit = 10485760
      where id = 'hr-employee-documents';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'storage'
        and table_name = 'buckets'
        and column_name = 'allowed_mime_types'
    ) then
      update storage.buckets
      set allowed_mime_types = array['application/pdf']::text[]
      where id = 'hr-employee-documents';
    end if;
  else
    raise notice 'storage.buckets not found. Create bucket hr-employee-documents manually in Supabase Storage.';
  end if;
end $$;

-- Storage policies.
-- Current ERP HR is admin-only in frontend/role_permissions. These policies allow authenticated users
-- to operate only inside this private bucket so the app can work without unknown role helper functions.
-- If you later add a backend role helper, replace auth.role() checks with admin-only role checks.
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists hr_employee_documents_select on storage.objects;
    drop policy if exists hr_employee_documents_insert on storage.objects;
    drop policy if exists hr_employee_documents_update on storage.objects;
    drop policy if exists hr_employee_documents_delete on storage.objects;

    create policy hr_employee_documents_select
      on storage.objects for select
      using (bucket_id = 'hr-employee-documents' and auth.role() = 'authenticated');

    create policy hr_employee_documents_insert
      on storage.objects for insert
      with check (bucket_id = 'hr-employee-documents' and auth.role() = 'authenticated');

    create policy hr_employee_documents_update
      on storage.objects for update
      using (bucket_id = 'hr-employee-documents' and auth.role() = 'authenticated')
      with check (bucket_id = 'hr-employee-documents' and auth.role() = 'authenticated');

    create policy hr_employee_documents_delete
      on storage.objects for delete
      using (bucket_id = 'hr-employee-documents' and auth.role() = 'authenticated');
  end if;
end $$;

-- =========================================================
-- 3) Employee Statement of Account support
-- =========================================================

-- Convert payroll_month text to a stable date.
-- Supports 'YYYY-MM', 'YYYY-MM-DD', or falls back to current_date if malformed.
create or replace function public.hr_payroll_month_to_date(p_payroll_month text)
returns date
language plpgsql
stable
as $$
declare
  v_text text := trim(coalesce(p_payroll_month, ''));
begin
  if v_text ~ '^\d{4}-\d{2}$' then
    return to_date(v_text || '-01', 'YYYY-MM-DD');
  elsif v_text ~ '^\d{4}-\d{2}-\d{2}$' then
    return to_date(v_text, 'YYYY-MM-DD');
  else
    return current_date;
  end if;
exception when others then
  return current_date;
end;
$$;

-- Payroll item status view: salary due, paid amount, remaining amount per employee/month/item.
create or replace view public.v_hr_payroll_item_payment_status as
with receipt_totals as (
  select
    coalesce(sr.payroll_item_id, pi.id) as payroll_item_id,
    sum(coalesce(sr.amount, 0))::numeric(14,2) as paid_amount
  from public.hr_salary_receipts sr
  left join public.hr_payroll_items pi
    on pi.employee_id = sr.employee_id
   and pi.run_id = sr.payroll_run_id
  where coalesce(sr.amount, 0) <> 0
  group by coalesce(sr.payroll_item_id, pi.id)
)
select
  pi.id as payroll_item_id,
  pi.run_id as payroll_run_id,
  pi.employee_id,
  pr.payroll_month,
  public.hr_payroll_month_to_date(pr.payroll_month) as payroll_month_date,
  coalesce(pi.net_salary, 0)::numeric(14,2) as net_salary,
  coalesce(rt.paid_amount, 0)::numeric(14,2) as paid_amount,
  greatest(coalesce(pi.net_salary, 0) - coalesce(rt.paid_amount, 0), 0)::numeric(14,2) as remaining_amount,
  case
    when coalesce(pi.net_salary, 0) <= 0 then 'Paid'
    when coalesce(rt.paid_amount, 0) >= coalesce(pi.net_salary, 0) then 'Paid'
    when coalesce(rt.paid_amount, 0) > 0 then 'Partially Paid'
    else 'Unpaid'
  end as payment_status
from public.hr_payroll_items pi
join public.hr_payroll_runs pr on pr.id = pi.run_id
left join receipt_totals rt on rt.payroll_item_id = pi.id
where coalesce(pr.status, '') <> 'cancelled'
  and coalesce(pi.status, '') <> 'cancelled';

-- Statement base view. Debit = salary generated. Credit = salary receipt/payment.
create or replace view public.v_hr_employee_statement_of_account as
select
  e.id as employee_id,
  e.full_name as employee_name,
  e.employee_no as employee_code,
  s.payroll_month_date as transaction_date,
  ('PAY-' || coalesce(pr.payroll_month, ''))::text as reference,
  'hr_payroll_items'::text as source_table,
  pi.id as source_id,
  'Salary Generated'::text as transaction_type,
  ('Monthly salary generated for ' || coalesce(pr.payroll_month, ''))::text as description,
  coalesce(pi.net_salary, 0)::numeric(14,2) as debit_amount,
  0::numeric(14,2) as credit_amount,
  pr.payroll_month,
  s.payment_status as status,
  pi.created_at
from public.hr_payroll_items pi
join public.hr_payroll_runs pr on pr.id = pi.run_id
join public.hr_employees e on e.id = pi.employee_id
join public.v_hr_payroll_item_payment_status s on s.payroll_item_id = pi.id
where coalesce(pr.status, '') <> 'cancelled'
  and coalesce(pi.status, '') <> 'cancelled'

union all

select
  e.id as employee_id,
  e.full_name as employee_name,
  e.employee_no as employee_code,
  coalesce(sr.payment_date, sr.created_at::date) as transaction_date,
  coalesce(sr.receipt_no, 'SALARY-RECEIPT')::text as reference,
  'hr_salary_receipts'::text as source_table,
  sr.id as source_id,
  'Salary Payment'::text as transaction_type,
  ('Salary receipt/payment for ' || coalesce(sr.payroll_month, pr.payroll_month, ''))::text as description,
  0::numeric(14,2) as debit_amount,
  coalesce(sr.amount, 0)::numeric(14,2) as credit_amount,
  coalesce(sr.payroll_month, pr.payroll_month) as payroll_month,
  coalesce(s.payment_status, 'Paid') as status,
  sr.created_at
from public.hr_salary_receipts sr
join public.hr_employees e on e.id = sr.employee_id
left join public.hr_payroll_items pi on pi.id = sr.payroll_item_id
left join public.hr_payroll_runs pr on pr.id = coalesce(sr.payroll_run_id, pi.run_id)
left join public.v_hr_payroll_item_payment_status s on s.payroll_item_id = pi.id
where coalesce(sr.amount, 0) <> 0;

create index if not exists idx_hr_salary_receipts_employee_date on public.hr_salary_receipts(employee_id, payment_date);
create index if not exists idx_hr_salary_receipts_run on public.hr_salary_receipts(payroll_run_id);
create index if not exists idx_hr_payroll_items_employee on public.hr_payroll_items(employee_id);

-- RPC with running balance and filters.
create or replace function public.get_hr_employee_statement(
  p_employee_id uuid default null,
  p_from_date date default null,
  p_to_date date default null,
  p_status text default 'All'
)
returns table (
  employee_id uuid,
  employee_name text,
  employee_code text,
  transaction_date date,
  reference text,
  source_table text,
  source_id uuid,
  transaction_type text,
  description text,
  debit numeric,
  credit numeric,
  balance numeric,
  payroll_month text,
  status text,
  created_at timestamptz
)
language sql
stable
as $$
  with filtered as (
    select
      v.employee_id,
      v.employee_name,
      v.employee_code,
      v.transaction_date,
      v.reference,
      v.source_table,
      v.source_id,
      v.transaction_type,
      v.description,
      coalesce(v.debit_amount, 0)::numeric(14,2) as debit,
      coalesce(v.credit_amount, 0)::numeric(14,2) as credit,
      v.payroll_month,
      v.status,
      v.created_at
    from public.v_hr_employee_statement_of_account v
    where (p_employee_id is null or v.employee_id = p_employee_id)
      and (p_from_date is null or v.transaction_date >= p_from_date)
      and (p_to_date is null or v.transaction_date <= p_to_date)
      and (
        coalesce(p_status, 'All') = 'All'
        or lower(v.status) = lower(p_status)
      )
  )
  select
    f.employee_id,
    f.employee_name,
    f.employee_code,
    f.transaction_date,
    f.reference,
    f.source_table,
    f.source_id,
    f.transaction_type,
    f.description,
    f.debit,
    f.credit,
    sum(f.debit - f.credit) over (
      partition by f.employee_id
      order by f.transaction_date, f.created_at, f.reference, f.transaction_type
      rows between unbounded preceding and current row
    )::numeric(14,2) as balance,
    f.payroll_month,
    f.status,
    f.created_at
  from filtered f
  order by f.employee_name, f.transaction_date, f.created_at, f.reference, f.transaction_type;
$$;

-- =========================================================
-- 4) HR admin-only permissions
-- =========================================================

do $$
declare
  item record;
begin
  if to_regclass('public.role_permissions') is null or to_regclass('public.roles') is null then
    raise notice 'role_permissions or roles table not found; skipping HR permission seed.';
    return;
  end if;

  if not exists (select 1 from public.roles where role_key = 'admin') then
    raise notice 'admin role_key not found in public.roles; skipping HR permission seed.';
    return;
  end if;

  -- Remove HR document/statement access from non-admin roles only for these new resources.
  delete from public.role_permissions
  where resource in (
    'hr_documents','hr.documents','hr.documents.upload',
    'hr_employee_statement','hr.employee_statement','hr_statement_of_account',
    'hr_salary_receipts','hr_payroll'
  )
  and role_key <> 'admin';

  for item in
    select * from (values
      ('hr_documents','view'),('hr_documents','list'),('hr_documents','create'),('hr_documents','update'),('hr_documents','delete'),('hr_documents','upload'),('hr_documents','download'),
      ('hr.documents','view'),('hr.documents','create'),('hr.documents','update'),('hr.documents','delete'),('hr.documents.upload','upload'),('hr.documents.upload','download'),
      ('hr_employee_statement','view'),('hr_employee_statement','print'),('hr_employee_statement','export'),
      ('hr.employee_statement','view'),('hr.employee_statement','print'),('hr.employee_statement','export'),
      ('hr_statement_of_account','view'),('hr_statement_of_account','print'),('hr_statement_of_account','export'),
      ('hr_salary_receipts','view'),('hr_salary_receipts','create'),('hr_salary_receipts','update'),('hr_salary_receipts','delete'),('hr_salary_receipts','print'),
      ('hr_payroll','view'),('hr_payroll','manage')
    ) as t(resource, action)
  loop
    begin
      insert into public.role_permissions (permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at)
      values (gen_random_uuid(), 'admin', item.resource, item.action, true, true, array['admin']::text[], now(), now())
      on conflict (role_key, resource, action)
      do update set
        is_allowed = true,
        is_active = true,
        allowed_roles = array['admin']::text[],
        updated_at = now();
    exception when invalid_column_reference then
      -- If there is no unique constraint matching ON CONFLICT, use manual upsert.
      if not exists (
        select 1 from public.role_permissions
        where role_key = 'admin' and resource = item.resource and action = item.action
      ) then
        insert into public.role_permissions (permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at)
        values (gen_random_uuid(), 'admin', item.resource, item.action, true, true, array['admin']::text[], now(), now());
      else
        update public.role_permissions
        set is_allowed = true,
            is_active = true,
            allowed_roles = array['admin']::text[],
            updated_at = now()
        where role_key = 'admin' and resource = item.resource and action = item.action;
      end if;
    end;
  end loop;
end $$;

-- =========================================================
-- 5) Grants for authenticated frontend usage
-- =========================================================

grant select, insert, update, delete on public.hr_documents to authenticated;
grant select on public.v_hr_payroll_item_payment_status to authenticated;
grant select on public.v_hr_employee_statement_of_account to authenticated;
grant execute on function public.get_hr_employee_statement(uuid, date, date, text) to authenticated;

-- Keep RLS enabled following the existing HR module pattern.
alter table public.hr_documents enable row level security;

do $$
begin
  drop policy if exists hr_documents_authenticated_select on public.hr_documents;
  drop policy if exists hr_documents_authenticated_insert on public.hr_documents;
  drop policy if exists hr_documents_authenticated_update on public.hr_documents;
  drop policy if exists hr_documents_authenticated_delete on public.hr_documents;

  create policy hr_documents_authenticated_select
    on public.hr_documents for select
    using (auth.role() = 'authenticated');

  create policy hr_documents_authenticated_insert
    on public.hr_documents for insert
    with check (auth.role() = 'authenticated');

  create policy hr_documents_authenticated_update
    on public.hr_documents for update
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

  create policy hr_documents_authenticated_delete
    on public.hr_documents for delete
    using (auth.role() = 'authenticated');
end $$;
