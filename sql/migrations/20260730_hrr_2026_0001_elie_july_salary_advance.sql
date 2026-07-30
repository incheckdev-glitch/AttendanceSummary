begin;

-- Distinguish normal salary payments from salary advances.
alter table public.hr_salary_receipts
  add column if not exists receipt_type text not null default 'salary_payment';

alter table public.hr_salary_receipts
  drop constraint if exists hr_salary_receipts_receipt_type_chk;

alter table public.hr_salary_receipts
  add constraint hr_salary_receipts_receipt_type_chk
  check (receipt_type in ('salary_payment', 'salary_advance'));

-- The Salary Advance migration must already exist before adding this link.
do $$
begin
  if to_regclass('public.hr_salary_advances') is null
     or to_regclass('public.hr_salary_advance_installments') is null
     or to_regclass('public.hr_payroll_salary_advances') is null then
    raise exception 'Run 20260730_hr_salary_advance_payslip.sql first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hr_salary_receipts'
      and column_name = 'salary_advance_id'
  ) then
    alter table public.hr_salary_receipts
      add column salary_advance_id uuid
      references public.hr_salary_advances(id) on delete set null;
  end if;
end $$;

create index if not exists idx_hr_salary_receipts_type
  on public.hr_salary_receipts(receipt_type);

create index if not exists idx_hr_salary_receipts_advance
  on public.hr_salary_receipts(salary_advance_id)
  where salary_advance_id is not null;

-- Correct HRR/2026/0001: it is a Salary Advance for Elie Francis,
-- applied to the July 2026 salary. The existing receipt amount is reused.
do $$
declare
  v_employee_id uuid;
  v_receipt_id uuid;
  v_receipt_amount numeric(14,2);
  v_currency text;
  v_existing_advance_id uuid;
  v_advance_id uuid;
  v_installment_id uuid;
  v_payroll_item_id uuid;
  v_payroll_run_id uuid;
  v_run_status text;
  v_total_advance numeric(14,2);
  v_salary_paid numeric(14,2);
begin
  select e.id
    into v_employee_id
  from public.hr_employees e
  where lower(regexp_replace(trim(e.full_name), '\s+', ' ', 'g')) = 'elie francis'
     or e.full_name ilike '%elie%francis%'
  order by case
    when lower(regexp_replace(trim(e.full_name), '\s+', ' ', 'g')) = 'elie francis' then 0
    else 1
  end,
  e.created_at
  limit 1;

  if v_employee_id is null then
    raise exception 'Employee Elie Francis was not found in hr_employees.';
  end if;

  select r.id, r.amount, coalesce(r.currency, 'USD'), r.salary_advance_id
    into v_receipt_id, v_receipt_amount, v_currency, v_existing_advance_id
  from public.hr_salary_receipts r
  where r.receipt_no = 'HRR/2026/0001'
  limit 1
  for update;

  if v_receipt_id is null then
    raise exception 'Receipt HRR/2026/0001 was not found in hr_salary_receipts.';
  end if;

  if coalesce(v_receipt_amount, 0) <= 0 then
    raise exception 'Receipt HRR/2026/0001 has no valid positive amount.';
  end if;

  -- Use the latest July payroll item when it already exists. If July payroll has
  -- not yet been generated, the approved installment will be picked up later.
  select pi.id, pr.id, pr.status
    into v_payroll_item_id, v_payroll_run_id, v_run_status
  from public.hr_payroll_items pi
  join public.hr_payroll_runs pr on pr.id = pi.run_id
  where pi.employee_id = v_employee_id
    and pr.payroll_month = '2026-07'
  order by
    case when pr.status in ('paid', 'locked') then 0
         when pr.status = 'approved' then 1
         when pr.status = 'reviewed' then 2
         else 3 end,
    coalesce(pr.updated_at, pr.created_at) desc
  limit 1
  for update of pi, pr;

  if v_existing_advance_id is not null then
    v_advance_id := v_existing_advance_id;

    update public.hr_salary_advances
    set employee_id = v_employee_id,
        approved_amount = v_receipt_amount,
        currency = v_currency,
        approval_status = 'approved',
        is_active = true,
        approved_at = coalesce(approved_at, now()),
        updated_at = now()
    where id = v_advance_id;
  else
    insert into public.hr_salary_advances (
      employee_id,
      approved_amount,
      remaining_balance,
      currency,
      approval_status,
      is_active,
      approved_at
    ) values (
      v_employee_id,
      v_receipt_amount,
      v_receipt_amount,
      v_currency,
      'approved',
      true,
      now()
    )
    returning id into v_advance_id;
  end if;

  select i.id
    into v_installment_id
  from public.hr_salary_advance_installments i
  where i.salary_advance_id = v_advance_id
    and i.payroll_month = '2026-07'
  order by i.created_at
  limit 1
  for update;

  if v_installment_id is null then
    insert into public.hr_salary_advance_installments (
      salary_advance_id,
      employee_id,
      payroll_month,
      amount,
      approval_status,
      is_active
    ) values (
      v_advance_id,
      v_employee_id,
      '2026-07',
      v_receipt_amount,
      'approved',
      true
    )
    returning id into v_installment_id;
  else
    update public.hr_salary_advance_installments
    set employee_id = v_employee_id,
        amount = v_receipt_amount,
        approval_status = 'approved',
        is_active = true,
        updated_at = now()
    where id = v_installment_id;
  end if;

  update public.hr_salary_receipts
  set employee_id = v_employee_id,
      payroll_month = '2026-07',
      payroll_item_id = v_payroll_item_id,
      payroll_run_id = v_payroll_run_id,
      receipt_type = 'salary_advance',
      salary_advance_id = v_advance_id,
      notes = case
        when coalesce(notes, '') ilike '%salary advance%july 2026%' then notes
        when nullif(trim(coalesce(notes, '')), '') is null then
          'Salary Advance applied to Elie Francis - July 2026 salary.'
        else notes || E'\nSalary Advance applied to Elie Francis - July 2026 salary.'
      end,
      updated_at = now()
  where id = v_receipt_id;

  if v_payroll_item_id is not null then
    insert into public.hr_payroll_salary_advances (
      payroll_item_id,
      installment_id,
      amount
    ) values (
      v_payroll_item_id,
      v_installment_id,
      v_receipt_amount
    )
    on conflict (installment_id) do update
      set payroll_item_id = excluded.payroll_item_id,
          amount = excluded.amount;

    select coalesce(sum(psa.amount), 0)
      into v_total_advance
    from public.hr_payroll_salary_advances psa
    where psa.payroll_item_id = v_payroll_item_id;

    select coalesce(sum(r.amount), 0)
      into v_salary_paid
    from public.hr_salary_receipts r
    where r.payroll_item_id = v_payroll_item_id
      and coalesce(r.receipt_type, 'salary_payment') = 'salary_payment';

    update public.hr_payroll_items
    set salary_advance_amount = round(v_total_advance, 2),
        net_salary = greatest(0, round(gross_salary - deductions - v_total_advance, 2)),
        remaining_amount = greatest(
          0,
          round(gross_salary - deductions - v_total_advance - v_salary_paid, 2)
        ),
        paid_amount = round(v_salary_paid, 2),
        updated_at = now()
    where id = v_payroll_item_id;

    if coalesce(v_run_status, '') in ('approved', 'paid', 'locked') then
      update public.hr_salary_advance_installments
      set payroll_item_id = v_payroll_item_id,
          deducted_at = coalesce(deducted_at, now()),
          paid_at = case
            when v_run_status in ('paid', 'locked') then coalesce(paid_at, now())
            else paid_at
          end,
          updated_at = now()
      where id = v_installment_id;

      update public.hr_salary_advances
      set remaining_balance = 0,
          updated_at = now()
      where id = v_advance_id;
    else
      update public.hr_salary_advances
      set remaining_balance = v_receipt_amount,
          updated_at = now()
      where id = v_advance_id;
    end if;
  end if;

  raise notice 'HRR/2026/0001 classified as Salary Advance for Elie Francis, July 2026. Amount: % %',
    v_currency, v_receipt_amount;
end $$;

commit;

-- Verification
select
  r.receipt_no,
  r.receipt_type,
  e.full_name as employee,
  r.payroll_month,
  r.amount,
  r.currency,
  r.salary_advance_id,
  r.payroll_item_id,
  r.notes
from public.hr_salary_receipts r
join public.hr_employees e on e.id = r.employee_id
where r.receipt_no = 'HRR/2026/0001';
