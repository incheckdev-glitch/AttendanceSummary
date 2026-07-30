-- Salary Advance installments are selected by employee + payroll month and snapshotted on payroll items.
create table if not exists public.hr_salary_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  approved_amount numeric(14,2) not null check (approved_amount > 0),
  remaining_balance numeric(14,2) not null check (remaining_balance >= 0),
  currency text not null default 'USD',
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','cancelled')),
  is_active boolean not null default true,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_salary_advance_installments (
  id uuid primary key default gen_random_uuid(),
  salary_advance_id uuid not null references public.hr_salary_advances(id) on delete restrict,
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  payroll_month text not null check (payroll_month ~ '^\\d{4}-(0[1-9]|1[0-2])$'),
  amount numeric(14,2) not null check (amount > 0),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','cancelled')),
  is_active boolean not null default true,
  payroll_item_id uuid references public.hr_payroll_items(id) on delete restrict,
  deducted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_at is null or deducted_at is not null)
);

alter table public.hr_payroll_items add column if not exists salary_advance_amount numeric(14,2) not null default 0 check (salary_advance_amount >= 0);

create table if not exists public.hr_payroll_salary_advances (
  id uuid primary key default gen_random_uuid(),
  payroll_item_id uuid not null references public.hr_payroll_items(id) on delete cascade,
  installment_id uuid not null references public.hr_salary_advance_installments(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (installment_id),
  unique (payroll_item_id, installment_id)
);

create index if not exists idx_hr_advance_installment_due on public.hr_salary_advance_installments(employee_id, payroll_month)
  where approval_status = 'approved' and is_active and deducted_at is null;
create index if not exists idx_hr_payroll_advance_item on public.hr_payroll_salary_advances(payroll_item_id);

alter table public.hr_salary_advances enable row level security;
alter table public.hr_salary_advance_installments enable row level security;
alter table public.hr_payroll_salary_advances enable row level security;

do $$
declare t text;
begin
  foreach t in array array['hr_salary_advances','hr_salary_advance_installments','hr_payroll_salary_advances'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t || '_admin_all', t);
  end loop;
end $$;

-- Finalizes the payroll and its advances in one transaction. Any mismatch raises an
-- exception, so approval is never saved without its installment/balance updates.
create or replace function public.hr_finalize_payroll_salary_advances(p_run_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_run public.hr_payroll_runs%rowtype;
  v_bad uuid;
  v_now timestamptz := now();
begin
  if auth.role() <> 'authenticated' then raise exception 'HR payroll access denied'; end if;
  if p_status not in ('approved','paid') then raise exception 'Unsupported payroll status'; end if;

  select * into v_run from public.hr_payroll_runs where id = p_run_id for update;
  if not found then raise exception 'Payroll run not found'; end if;
  if v_run.status in ('paid','locked') and v_run.status <> p_status then
    raise exception 'Finalized payroll cannot be changed';
  end if;

  -- Validate the persisted snapshot against the links and source installments.
  select pi.id into v_bad
  from public.hr_payroll_items pi
  left join public.hr_payroll_salary_advances psa on psa.payroll_item_id = pi.id
  left join public.hr_salary_advance_installments sai on sai.id = psa.installment_id
  left join public.hr_salary_advances sa on sa.id = sai.salary_advance_id
  where pi.run_id = p_run_id
  group by pi.id, pi.employee_id, pi.salary_advance_amount
  having round(coalesce(sum(psa.amount), 0), 2) <> round(pi.salary_advance_amount, 2)
     or count(psa.installment_id) filter (where sai.id is null or sai.employee_id <> pi.employee_id
       or sai.payroll_month <> v_run.payroll_month or sai.approval_status <> 'approved'
       or not sai.is_active or sa.approval_status <> 'approved' or not sa.is_active or sa.employee_id <> pi.employee_id
       or (sai.deducted_at is not null and sai.payroll_item_id <> pi.id)) > 0
  limit 1;
  if v_bad is not null then raise exception 'Salary Advance link validation failed for payroll item %', v_bad; end if;

  -- A due installment omitted from a payroll item is also a linkage error.
  select sai.id into v_bad from public.hr_salary_advance_installments sai
  join public.hr_payroll_items pi on pi.run_id = p_run_id and pi.employee_id = sai.employee_id
  join public.hr_salary_advances sa on sa.id = sai.salary_advance_id and sa.employee_id = sai.employee_id
  where sai.payroll_month = v_run.payroll_month and sai.approval_status = 'approved' and sai.is_active
    and sa.approval_status = 'approved' and sa.is_active
    and sai.deducted_at is null
    and not exists (select 1 from public.hr_payroll_salary_advances psa where psa.installment_id = sai.id and psa.payroll_item_id = pi.id)
  limit 1;
  if v_bad is not null then raise exception 'Approved Salary Advance installment % is not linked', v_bad; end if;

  -- Subtract only rows not previously deducted, making repeated approval idempotent.
  update public.hr_salary_advances sa set
    remaining_balance = greatest(0, sa.remaining_balance - x.amount), updated_at = v_now
  from (
    select sai.salary_advance_id, sum(sai.amount) amount
    from public.hr_salary_advance_installments sai
    join public.hr_payroll_salary_advances psa on psa.installment_id = sai.id
    join public.hr_payroll_items pi on pi.id = psa.payroll_item_id
    where pi.run_id = p_run_id and sai.deducted_at is null
    group by sai.salary_advance_id
  ) x where sa.id = x.salary_advance_id;

  update public.hr_salary_advance_installments sai set payroll_item_id = psa.payroll_item_id,
    deducted_at = coalesce(sai.deducted_at, v_now),
    paid_at = case when p_status = 'paid' then coalesce(sai.paid_at, v_now) else sai.paid_at end,
    updated_at = v_now
  from public.hr_payroll_salary_advances psa join public.hr_payroll_items pi on pi.id = psa.payroll_item_id
  where sai.id = psa.installment_id and pi.run_id = p_run_id;

  update public.hr_payroll_items set status = p_status, updated_at = v_now where run_id = p_run_id;
  update public.hr_payroll_runs set status = p_status,
    approved_at = case when p_status = 'approved' then coalesce(approved_at, v_now) else approved_at end,
    paid_at = case when p_status = 'paid' then coalesce(paid_at, v_now) else paid_at end,
    updated_at = v_now where id = p_run_id;
end $$;
revoke all on function public.hr_finalize_payroll_salary_advances(uuid,text) from public;
grant execute on function public.hr_finalize_payroll_salary_advances(uuid,text) to authenticated;
