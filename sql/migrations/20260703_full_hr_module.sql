-- InCheck360 Full HR Module
-- Creates HR, Attendance, Leave, Payroll, Payslip, Documents and HR Settings tables.
-- Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.hr_shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Office Shift',
  start_time text not null default '09:00',
  end_time text not null default '18:00',
  grace_minutes integer not null default 15,
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
  status text not null default 'active' check (status in ('active','suspended','resigned','terminated')),
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
  status text not null default 'present' check (status in ('present','late','absent','half_day','on_leave','holiday','weekend')),
  method text not null default 'Manual',
  notes text,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  days numeric(10,2) not null default 0,
  paid boolean not null default true,
  status text not null default 'pending_manager' check (status in ('pending_manager','pending_hr','approved','rejected','cancelled')),
  reason text,
  manager_status text default 'pending',
  hr_status text default 'pending',
  requested_by text,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  document_type text not null,
  document_name text not null,
  file_url text,
  expiry_date date,
  status text not null default 'valid' check (status in ('valid','missing','expired')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  payroll_month text not null,
  status text not null default 'draft' check (status in ('draft','reviewed','approved','paid','locked','cancelled')),
  currency text not null default 'USD',
  generated_at timestamptz not null default now(),
  generated_by text,
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create index if not exists idx_hr_employees_status on public.hr_employees(status);
create index if not exists idx_hr_employees_department on public.hr_employees(department);
create index if not exists idx_hr_attendance_date on public.hr_attendance(attendance_date);
create index if not exists idx_hr_attendance_employee_date on public.hr_attendance(employee_id, attendance_date);
create index if not exists idx_hr_leave_employee_status on public.hr_leave_requests(employee_id, status);
create index if not exists idx_hr_documents_expiry on public.hr_documents(expiry_date);
create index if not exists idx_hr_payroll_runs_month on public.hr_payroll_runs(payroll_month);
create index if not exists idx_hr_payroll_items_run on public.hr_payroll_items(run_id);

alter table public.hr_shifts enable row level security;
alter table public.hr_leave_types enable row level security;
alter table public.hr_employees enable row level security;
alter table public.hr_attendance enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.hr_documents enable row level security;
alter table public.hr_payroll_runs enable row level security;
alter table public.hr_payroll_items enable row level security;

-- Generic authenticated policies. Frontend and role_permissions still control visible actions.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['hr_shifts','hr_leave_types','hr_employees','hr_attendance','hr_leave_requests','hr_documents','hr_payroll_runs','hr_payroll_items'] loop
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
select 'Office Shift', '09:00', '18:00', 15, 60, 'Mon,Tue,Wed,Thu,Fri', 'Sat,Sun', 1.50
where not exists (select 1 from public.hr_shifts where lower(name) = 'office shift');

insert into public.hr_leave_types (name, paid, yearly_balance, requires_document)
values
  ('Annual Leave', true, 15, false),
  ('Sick Leave', true, 7, true),
  ('Emergency Leave', true, 3, false),
  ('Unpaid Leave', false, 0, false),
  ('Work From Home', true, 24, false)
on conflict (name) do update set
  paid = excluded.paid,
  yearly_balance = excluded.yearly_balance,
  requires_document = excluded.requires_document,
  is_active = true,
  updated_at = now();

-- Seed permission matrix rows for the new HR module.
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('hr','view','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm,senior_financial_controller,senior_fc,sfc,accountant,accounting,hoo,head_of_operations'),
      ('hr','list','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm,senior_financial_controller,senior_fc,sfc,accountant,accounting,hoo,head_of_operations'),
      ('hr','get','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm,senior_financial_controller,senior_fc,sfc,accountant,accounting,hoo,head_of_operations'),
      ('hr','create','admin,dev,developer,hr,hr_manager,human_resources'),
      ('hr','update','admin,dev,developer,hr,hr_manager,human_resources'),
      ('hr','manage','admin,dev,developer,hr,hr_manager,human_resources'),
      ('hr','export','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm,senior_financial_controller,senior_fc,sfc,accountant,accounting'),
      ('hr','manage_attendance','admin,dev,developer,hr,hr_manager,human_resources,hoo,head_of_operations'),
      ('hr_attendance','view','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm,hoo,head_of_operations'),
      ('hr_attendance','list','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm,hoo,head_of_operations'),
      ('hr_attendance','create','admin,dev,developer,hr,hr_manager,human_resources,hoo,head_of_operations'),
      ('hr_attendance','update','admin,dev,developer,hr,hr_manager,human_resources,hoo,head_of_operations'),
      ('hr_attendance','export','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm'),
      ('hr_leave','view','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm,hoo,head_of_operations'),
      ('hr_leave','list','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm,hoo,head_of_operations'),
      ('hr_leave','create','admin,dev,developer,hr,hr_manager,human_resources,hoo,head_of_operations'),
      ('hr_leave','update','admin,dev,developer,hr,hr_manager,human_resources'),
      ('hr_leave','approve','admin,hr,hr_manager,human_resources,general_manager,gm,hoo,head_of_operations'),
      ('hr_payroll','view','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm,senior_financial_controller,senior_fc,sfc,accountant,accounting'),
      ('hr_payroll','list','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm,senior_financial_controller,senior_fc,sfc,accountant,accounting'),
      ('hr_payroll','generate','admin,hr,hr_manager,human_resources'),
      ('hr_payroll','review','admin,senior_financial_controller,senior_fc,sfc,accountant,accounting'),
      ('hr_payroll','approve','admin,general_manager,gm,senior_financial_controller,senior_fc,sfc'),
      ('hr_payroll','pay','admin,accountant,accounting,senior_financial_controller,senior_fc,sfc'),
      ('hr_payroll','export','admin,hr,hr_manager,human_resources,general_manager,gm,senior_financial_controller,senior_fc,sfc,accountant,accounting'),
      ('hr_payroll','manage','admin,hr,hr_manager,human_resources'),
      ('hr_documents','view','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm'),
      ('hr_documents','list','admin,dev,developer,hr,hr_manager,human_resources,general_manager,gm'),
      ('hr_documents','create','admin,dev,developer,hr,hr_manager,human_resources'),
      ('hr_documents','update','admin,dev,developer,hr,hr_manager,human_resources'),
      ('hr_settings','view','admin,dev,developer,hr,hr_manager,human_resources'),
      ('hr_settings','update','admin,dev,developer,hr,hr_manager,human_resources'),
      ('hr_settings','manage','admin,dev,developer,hr,hr_manager,human_resources')
    ) as t(resource, action, roles_csv)
  loop
    insert into public.role_permissions (permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at)
    select gen_random_uuid(), trim(role_key), item.resource, item.action, true, true, array[trim(role_key)]::text[], now(), now()
    from regexp_split_to_table(item.roles_csv, ',') as role_key
    on conflict (role_key, resource, action)
    do update set is_allowed = true, is_active = true, allowed_roles = excluded.allowed_roles, updated_at = now();
  end loop;
exception when undefined_table then
  raise notice 'role_permissions table not found; HR permissions were added to frontend base matrix only.';
end $$;
