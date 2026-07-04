-- InCheck360 HR Admin-Only Payroll Module
-- Safe to re-run.
-- Current rule set:
--   Admin-only access for now.
--   Employees do not check in/out and do not access HR.
--   Saturday and Sunday are non-working days.
--   Holidays calendar reduces working days.
--   Monthly salary is fixed.
--   Monthly transportation allowance is divided by working days and paid only for eligible days.
--   Approved leave/sick/manual absent days deduct transportation.
--   Annual Leave accrues 15 days/year, 1.25 days/month.
--   Salary receipts support full/partial payment and remaining salary rest.

create extension if not exists pgcrypto;

create table if not exists public.hr_shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Office Shift',
  start_time text not null default '09:00',
  end_time text not null default '18:00',
  grace_minutes integer not null default 0,
  break_minutes integer not null default 60,
  working_days text not null default 'Mon,Tue,Wed,Thu,Fri',
  weekend_days text not null default 'Sat,Sun',
  overtime_rate numeric(10,2) not null default 1.50,
  late_deduction_per_minute numeric(12,4) not null default 0,
  early_leave_deduction_per_minute numeric(12,4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  paid boolean not null default true,
  yearly_balance numeric(10,2) not null default 0,
  requires_document boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_leave_types add column if not exists monthly_accrual numeric(10,2) not null default 0;
alter table public.hr_leave_types add column if not exists deduct_transportation boolean not null default true;

create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  employee_no text not null unique,
  full_name text not null,
  email text,
  phone text,
  department text,
  job_title text,
  manager_name text,
  employment_type text not null default 'Full-time',
  joining_date date,
  status text not null default 'active',
  work_location text,
  shift_id uuid references public.hr_shifts(id) on delete set null,
  leave_policy text default 'Standard',
  base_salary numeric(14,2) not null default 0,
  currency text not null default 'USD',
  allowances numeric(14,2) not null default 0,
  fixed_deductions numeric(14,2) not null default 0,
  payment_method text default 'Bank Transfer',
  bank_name text,
  bank_account text,
  salary_effective_date date,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_employees add column if not exists transportation_monthly numeric(14,2) not null default 0;
alter table public.hr_employees add column if not exists transportation_monthly_allowance numeric(14,2) not null default 0;
alter table public.hr_employees add column if not exists transportation_per_day numeric(14,2) not null default 0;

do $$
begin
  alter table public.hr_employees drop constraint if exists hr_employees_status_check;
  alter table public.hr_employees add constraint hr_employees_status_check check (status in ('active','suspended','resigned','terminated'));
exception when duplicate_object then null;
end $$;

create table if not exists public.hr_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  attendance_date date not null,
  check_in_time text,
  check_out_time text,
  worked_hours numeric(10,2) not null default 0,
  late_minutes integer not null default 0,
  early_leave_minutes integer not null default 0,
  overtime_hours numeric(10,2) not null default 0,
  status text not null default 'present',
  method text not null default 'Manual',
  notes text,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);

do $$
begin
  alter table public.hr_attendance drop constraint if exists hr_attendance_status_check;
  alter table public.hr_attendance add constraint hr_attendance_status_check check (status in ('present','late','absent','half_day','on_leave','holiday','weekend'));
exception when duplicate_object then null;
end $$;

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  days numeric(10,2) not null default 0,
  paid boolean not null default true,
  status text not null default 'pending',
  reason text,
  manager_status text default 'approved',
  hr_status text default 'pending',
  requested_by text,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_leave_requests add column if not exists deduct_transportation boolean not null default true;
alter table public.hr_leave_requests add column if not exists document_url text;
alter table public.hr_leave_requests add column if not exists approved_at timestamptz;

do $$
begin
  alter table public.hr_leave_requests drop constraint if exists hr_leave_requests_status_check;
  alter table public.hr_leave_requests add constraint hr_leave_requests_status_check check (status in ('pending','pending_manager','pending_hr','approved','rejected','cancelled'));
exception when duplicate_object then null;
end $$;

create table if not exists public.hr_leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_type text not null,
  year integer not null,
  entitlement_days numeric(10,2),
  carry_forward_days numeric(10,2) not null default 0,
  adjustment_days numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, leave_type, year)
);

alter table public.hr_leave_balances alter column entitlement_days drop not null;

create table if not exists public.hr_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  country text,
  is_paid boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(holiday_date, name)
);

create table if not exists public.hr_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  document_type text not null,
  document_name text not null,
  file_url text,
  expiry_date date,
  status text not null default 'valid',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.hr_documents drop constraint if exists hr_documents_status_check;
  alter table public.hr_documents add constraint hr_documents_status_check check (status in ('valid','missing','expired'));
exception when duplicate_object then null;
end $$;

create table if not exists public.hr_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  payroll_month text not null,
  status text not null default 'draft',
  currency text not null default 'USD',
  generated_at timestamptz not null default now(),
  generated_by text,
  reviewed_at timestamptz,
  reviewed_by text,
  approved_at timestamptz,
  paid_at timestamptz,
  locked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_payroll_runs add column if not exists reviewed_at timestamptz;
alter table public.hr_payroll_runs add column if not exists reviewed_by text;
alter table public.hr_payroll_runs add column if not exists locked_at timestamptz;

do $$
begin
  alter table public.hr_payroll_runs drop constraint if exists hr_payroll_runs_status_check;
  alter table public.hr_payroll_runs add constraint hr_payroll_runs_status_check check (status in ('draft','reviewed','approved','paid','locked','cancelled'));
exception when duplicate_object then null;
end $$;

create table if not exists public.hr_payroll_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.hr_payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  currency text not null default 'USD',
  working_days numeric(10,2) not null default 0,
  present_days numeric(10,2) not null default 0,
  absent_days numeric(10,2) not null default 0,
  paid_leave_days numeric(10,2) not null default 0,
  unpaid_leave_days numeric(10,2) not null default 0,
  late_minutes integer not null default 0,
  overtime_hours numeric(10,2) not null default 0,
  basic_salary numeric(14,2) not null default 0,
  daily_rate numeric(14,2) not null default 0,
  allowances numeric(14,2) not null default 0,
  overtime_amount numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  gross_salary numeric(14,2) not null default 0,
  net_salary numeric(14,2) not null default 0,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, employee_id)
);

alter table public.hr_payroll_items add column if not exists detected_overtime_hours numeric(10,2) not null default 0;
alter table public.hr_payroll_items add column if not exists transportation_monthly numeric(14,2) not null default 0;
alter table public.hr_payroll_items add column if not exists transportation_per_day numeric(14,2) not null default 0;
alter table public.hr_payroll_items add column if not exists transportation_days numeric(10,2) not null default 0;
alter table public.hr_payroll_items add column if not exists transportation_allowance numeric(14,2) not null default 0;
alter table public.hr_payroll_items add column if not exists transportation_deduction numeric(14,2) not null default 0;
alter table public.hr_payroll_items add column if not exists leave_transport_deduct_days numeric(10,2) not null default 0;
alter table public.hr_payroll_items add column if not exists leave_transport_paid_days numeric(10,2) not null default 0;
alter table public.hr_payroll_items add column if not exists absence_deduction numeric(14,2) not null default 0;
alter table public.hr_payroll_items add column if not exists late_deduction numeric(14,2) not null default 0;
alter table public.hr_payroll_items add column if not exists early_leave_deduction numeric(14,2) not null default 0;
alter table public.hr_payroll_items add column if not exists fixed_deductions numeric(14,2) not null default 0;
alter table public.hr_payroll_items add column if not exists paid_amount numeric(14,2) not null default 0;
alter table public.hr_payroll_items add column if not exists remaining_amount numeric(14,2) not null default 0;
alter table public.hr_payroll_items add column if not exists details jsonb not null default '{}'::jsonb;

create table if not exists public.hr_salary_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  payroll_item_id uuid references public.hr_payroll_items(id) on delete set null,
  payroll_run_id uuid references public.hr_payroll_runs(id) on delete set null,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  payroll_month text not null,
  payment_date date not null default current_date,
  amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  payment_method text default 'Bank Transfer',
  reference_no text,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text,
  type text not null default 'info',
  entity_type text,
  entity_id text,
  is_read boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_employees_status on public.hr_employees(status);
create index if not exists idx_hr_employees_department on public.hr_employees(department);
create index if not exists idx_hr_attendance_date on public.hr_attendance(attendance_date);
create index if not exists idx_hr_attendance_employee_date on public.hr_attendance(employee_id, attendance_date);
create index if not exists idx_hr_leave_employee_status on public.hr_leave_requests(employee_id, status);
create index if not exists idx_hr_leave_balances_employee_year on public.hr_leave_balances(employee_id, year);
create index if not exists idx_hr_holidays_date on public.hr_holidays(holiday_date);
create index if not exists idx_hr_documents_expiry on public.hr_documents(expiry_date);
create index if not exists idx_hr_payroll_runs_month on public.hr_payroll_runs(payroll_month);
create index if not exists idx_hr_payroll_items_run on public.hr_payroll_items(run_id);
create index if not exists idx_hr_salary_receipts_item on public.hr_salary_receipts(payroll_item_id);
create index if not exists idx_hr_salary_receipts_month on public.hr_salary_receipts(payroll_month);
create index if not exists idx_hr_notifications_created on public.hr_notifications(created_at);

-- Enable RLS with broad authenticated policies to match the existing ERP frontend role-gating style.
alter table public.hr_shifts enable row level security;
alter table public.hr_leave_types enable row level security;
alter table public.hr_employees enable row level security;
alter table public.hr_attendance enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.hr_leave_balances enable row level security;
alter table public.hr_holidays enable row level security;
alter table public.hr_documents enable row level security;
alter table public.hr_payroll_runs enable row level security;
alter table public.hr_payroll_items enable row level security;
alter table public.hr_salary_receipts enable row level security;
alter table public.hr_notifications enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'hr_shifts','hr_leave_types','hr_employees','hr_attendance','hr_leave_requests','hr_leave_balances','hr_holidays','hr_documents','hr_payroll_runs','hr_payroll_items','hr_salary_receipts','hr_notifications'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_authenticated_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_authenticated_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_authenticated_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_authenticated_delete', table_name);
    execute format('create policy %I on public.%I for select using (auth.role() = ''authenticated'')', table_name || '_authenticated_select', table_name);
    execute format('create policy %I on public.%I for insert with check (auth.role() = ''authenticated'')', table_name || '_authenticated_insert', table_name);
    execute format('create policy %I on public.%I for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', table_name || '_authenticated_update', table_name);
    execute format('create policy %I on public.%I for delete using (auth.role() = ''authenticated'')', table_name || '_authenticated_delete', table_name);
  end loop;
end $$;

insert into public.hr_shifts (name, start_time, end_time, grace_minutes, break_minutes, working_days, weekend_days, overtime_rate)
select 'Office Shift', '09:00', '18:00', 0, 60, 'Mon,Tue,Wed,Thu,Fri', 'Sat,Sun', 1.50
where not exists (select 1 from public.hr_shifts where lower(name) = 'office shift');

update public.hr_shifts
set working_days = 'Mon,Tue,Wed,Thu,Fri', weekend_days = 'Sat,Sun', updated_at = now()
where lower(name) = 'office shift';

insert into public.hr_leave_types (name, paid, yearly_balance, monthly_accrual, deduct_transportation, requires_document)
values
  ('Annual Leave', true, 15, 1.25, true, false),
  ('Sick Leave', true, 0, 0, true, true),
  ('Emergency Leave', true, 0, 0, true, false),
  ('Unpaid Leave', false, 0, 0, true, false)
on conflict (name) do update set
  paid = excluded.paid,
  yearly_balance = excluded.yearly_balance,
  monthly_accrual = excluded.monthly_accrual,
  deduct_transportation = excluded.deduct_transportation,
  requires_document = excluded.requires_document,
  is_active = true,
  updated_at = now();

-- Backfill previous transportation-per-day setups into monthly value only if monthly is still zero.
update public.hr_employees
set transportation_monthly = coalesce(nullif(transportation_monthly, 0), transportation_per_day * 22),
    transportation_monthly_allowance = coalesce(nullif(transportation_monthly_allowance, 0), coalesce(nullif(transportation_monthly, 0), transportation_per_day * 22)),
    updated_at = now()
where coalesce(transportation_monthly, 0) = 0 and coalesce(transportation_per_day, 0) > 0;

-- Admin-only frontend permission matrix. Other roles can be added later.
do $$
declare
  item record;
begin
  if to_regclass('public.role_permissions') is null or to_regclass('public.roles') is null then
    raise notice 'role_permissions or roles table not found; frontend base matrix will still restrict HR to admin.';
    return;
  end if;

  delete from public.role_permissions
  where resource in (
    'hr','hr_attendance','hr_leave','hr_leave_balance','hr_holidays','hr_payroll','hr_salary_receipts','hr_documents','hr_settings',
    'hr_self_service','hr_team','hr_attendance_correction','hr_overtime','hr_notifications','hr_requests'
  )
  and role_key <> 'admin';

  for item in
    select * from (values
      ('hr','view'),('hr','list'),('hr','get'),('hr','create'),('hr','update'),('hr','manage'),('hr','export'),('hr','manage_attendance'),
      ('hr_attendance','view'),('hr_attendance','list'),('hr_attendance','create'),('hr_attendance','update'),('hr_attendance','delete'),('hr_attendance','export'),
      ('hr_leave','view'),('hr_leave','list'),('hr_leave','create'),('hr_leave','update'),('hr_leave','approve'),('hr_leave','delete'),
      ('hr_leave_balance','view'),('hr_leave_balance','update'),('hr_leave_balance','manage'),
      ('hr_holidays','view'),('hr_holidays','create'),('hr_holidays','update'),('hr_holidays','delete'),
      ('hr_payroll','view'),('hr_payroll','list'),('hr_payroll','generate'),('hr_payroll','review'),('hr_payroll','approve'),('hr_payroll','pay'),('hr_payroll','export'),('hr_payroll','manage'),
      ('hr_salary_receipts','view'),('hr_salary_receipts','create'),('hr_salary_receipts','update'),('hr_salary_receipts','delete'),('hr_salary_receipts','manage'),
      ('hr_documents','view'),('hr_documents','list'),('hr_documents','create'),('hr_documents','update'),('hr_documents','delete'),
      ('hr_settings','view'),('hr_settings','update'),('hr_settings','manage'),
      ('hr_notifications','view')
    ) as t(resource, action)
  loop
    insert into public.role_permissions (permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at)
    select gen_random_uuid(), 'admin', item.resource, item.action, true, true, array['admin']::text[], now(), now()
    where exists (select 1 from public.roles where role_key = 'admin')
    on conflict (role_key, resource, action)
    do update set is_allowed = true, is_active = true, allowed_roles = array['admin']::text[], updated_at = now();
  end loop;
end $$;
