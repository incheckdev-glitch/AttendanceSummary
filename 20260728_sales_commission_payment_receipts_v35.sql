-- InCheck360 CRM · Sales Commission Payment Receipts V35
-- Marks a commission installment paid and issues one persistent receipt atomically.
-- Receipt format: CR/YYYY/00001
-- Requires the Sales Commission Tracker V24 and access-level migration V29.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.sales_commissions') is null
     or to_regclass('public.sales_commission_installments') is null then
    raise exception 'Install the Sales Commission Tracker V24 migration before V35.';
  end if;
  if to_regprocedure('public.sales_commission_access_level()') is null then
    raise exception 'Install the Sales Commission access-level V29 migration before V35.';
  end if;
end;
$$;

create sequence if not exists public.sales_commission_receipt_no_seq start with 1 increment by 1;

create table if not exists public.sales_commission_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null,
  commission_id uuid not null references public.sales_commissions(id) on delete restrict,
  installment_id uuid not null references public.sales_commission_installments(id) on delete restrict,
  invoice_id text,
  invoice_number text,
  client_name text,
  salesperson_id uuid,
  salesperson_name text not null,
  salesperson_email text,
  currency text not null default 'USD',
  amount numeric(18,2) not null default 0,
  payment_date date not null,
  payment_reference text,
  notes text,
  status text not null default 'issued',
  issued_by uuid,
  issued_by_name text,
  issued_by_email text,
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  constraint sales_commission_receipts_number_uidx unique (receipt_number),
  constraint sales_commission_receipts_installment_uidx unique (installment_id),
  constraint sales_commission_receipts_amount_chk check (amount > 0),
  constraint sales_commission_receipts_status_chk check (status in ('issued','void'))
);

create index if not exists sales_commission_receipts_commission_idx
  on public.sales_commission_receipts(commission_id);
create index if not exists sales_commission_receipts_salesperson_idx
  on public.sales_commission_receipts(salesperson_id);
create index if not exists sales_commission_receipts_date_idx
  on public.sales_commission_receipts(payment_date desc);

create or replace function public.assign_sales_commission_receipt_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(new.receipt_number, '')), '') is null then
    new.receipt_number :=
      'CR/' || extract(year from coalesce(new.payment_date, current_date))::integer::text || '/' ||
      lpad(nextval('public.sales_commission_receipt_no_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_sales_commission_receipt_number
  on public.sales_commission_receipts;
create trigger trg_assign_sales_commission_receipt_number
before insert on public.sales_commission_receipts
for each row execute function public.assign_sales_commission_receipt_number();

alter table public.sales_commission_receipts enable row level security;

drop policy if exists sales_commission_receipts_select_policy
  on public.sales_commission_receipts;
create policy sales_commission_receipts_select_policy
on public.sales_commission_receipts for select
to authenticated
using (
  public.sales_commission_access_level() in ('manage_all','view_all')
  or (
    public.sales_commission_access_level() = 'view_related'
    and (
      salesperson_id = auth.uid()
      or lower(btrim(coalesce(salesperson_email, ''))) = lower(btrim(coalesce(
        auth.jwt()->>'email',
        auth.jwt()->'user_metadata'->>'email',
        ''
      )))
    )
  )
);

drop policy if exists sales_commission_receipts_insert_policy
  on public.sales_commission_receipts;
create policy sales_commission_receipts_insert_policy
on public.sales_commission_receipts for insert
to authenticated
with check (public.sales_commission_access_level() = 'manage_all');

drop policy if exists sales_commission_receipts_update_policy
  on public.sales_commission_receipts;
create policy sales_commission_receipts_update_policy
on public.sales_commission_receipts for update
to authenticated
using (public.sales_commission_access_level() = 'manage_all')
with check (public.sales_commission_access_level() = 'manage_all');

grant select, insert, update on public.sales_commission_receipts to authenticated;
grant usage, select on sequence public.sales_commission_receipt_no_seq to authenticated;

-- Internal helper used by both payment and legacy-paid-installment receipt issuance.
create or replace function public.upsert_sales_commission_receipt(
  p_installment_id uuid
)
returns public.sales_commission_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installment public.sales_commission_installments%rowtype;
  v_commission public.sales_commissions%rowtype;
  v_receipt public.sales_commission_receipts%rowtype;
  v_user_name text;
  v_user_email text;
begin
  if public.sales_commission_access_level() <> 'manage_all' then
    raise exception 'You do not have permission to issue commission receipts.';
  end if;

  select * into v_installment
  from public.sales_commission_installments
  where id = p_installment_id
  for update;

  if not found then
    raise exception 'Commission installment was not found.';
  end if;

  if lower(coalesce(v_installment.status, '')) <> 'paid'
     or coalesce(v_installment.paid_amount, 0) <= 0
     or v_installment.paid_date is null then
    raise exception 'The commission installment must be marked paid before issuing a receipt.';
  end if;

  select * into v_commission
  from public.sales_commissions
  where id = v_installment.commission_id;

  if not found then
    raise exception 'Parent commission record was not found.';
  end if;

  select
    coalesce(nullif(btrim(to_jsonb(profile)->>'name'), ''),
             nullif(btrim(to_jsonb(profile)->>'full_name'), ''),
             nullif(btrim(to_jsonb(profile)->>'username'), '')),
    nullif(btrim(to_jsonb(profile)->>'email'), '')
  into v_user_name, v_user_email
  from public.profiles profile
  where profile.id = auth.uid()
  limit 1;

  v_user_email := coalesce(
    v_user_email,
    nullif(btrim(auth.jwt()->>'email'), ''),
    nullif(btrim(auth.jwt()->'user_metadata'->>'email'), '')
  );
  v_user_name := coalesce(v_user_name, v_user_email, 'InCheck360 User');

  insert into public.sales_commission_receipts (
    receipt_number,
    commission_id,
    installment_id,
    invoice_id,
    invoice_number,
    client_name,
    salesperson_id,
    salesperson_name,
    salesperson_email,
    currency,
    amount,
    payment_date,
    payment_reference,
    notes,
    status,
    issued_by,
    issued_by_name,
    issued_by_email,
    issued_at,
    updated_at,
    voided_at,
    voided_by
  ) values (
    null,
    v_commission.id,
    v_installment.id,
    v_commission.invoice_id,
    v_commission.invoice_number,
    v_commission.client_name,
    v_commission.salesperson_id,
    v_commission.salesperson_name,
    v_commission.salesperson_email,
    v_commission.currency,
    v_installment.paid_amount,
    v_installment.paid_date,
    v_installment.payment_reference,
    v_installment.notes,
    'issued',
    auth.uid(),
    v_user_name,
    v_user_email,
    now(),
    now(),
    null,
    null
  )
  on conflict (installment_id) do update
  set
    commission_id = excluded.commission_id,
    invoice_id = excluded.invoice_id,
    invoice_number = excluded.invoice_number,
    client_name = excluded.client_name,
    salesperson_id = excluded.salesperson_id,
    salesperson_name = excluded.salesperson_name,
    salesperson_email = excluded.salesperson_email,
    currency = excluded.currency,
    amount = excluded.amount,
    payment_date = excluded.payment_date,
    payment_reference = excluded.payment_reference,
    notes = excluded.notes,
    status = 'issued',
    issued_by = excluded.issued_by,
    issued_by_name = excluded.issued_by_name,
    issued_by_email = excluded.issued_by_email,
    issued_at = now(),
    updated_at = now(),
    voided_at = null,
    voided_by = null
  returning * into v_receipt;

  return v_receipt;
end;
$$;

create or replace function public.record_sales_commission_payment(
  p_installment_id uuid,
  p_paid_date date,
  p_payment_reference text default null,
  p_notes text default null
)
returns public.sales_commission_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installment public.sales_commission_installments%rowtype;
  v_receipt public.sales_commission_receipts%rowtype;
  v_total numeric(18,2);
  v_paid numeric(18,2);
  v_status text;
begin
  if public.sales_commission_access_level() <> 'manage_all' then
    raise exception 'You do not have permission to record commission payments.';
  end if;

  if p_paid_date is null then
    raise exception 'Paid date is required.';
  end if;

  select * into v_installment
  from public.sales_commission_installments
  where id = p_installment_id
  for update;

  if not found then
    raise exception 'Commission installment was not found.';
  end if;

  update public.sales_commission_installments
  set
    status = 'paid',
    paid_amount = commission_amount,
    paid_date = p_paid_date,
    payment_reference = nullif(btrim(coalesce(p_payment_reference, '')), ''),
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    updated_at = now()
  where id = p_installment_id;

  select
    coalesce(sum(commission_amount), 0),
    coalesce(sum(paid_amount), 0)
  into v_total, v_paid
  from public.sales_commission_installments
  where commission_id = v_installment.commission_id;

  v_status := case
    when v_total > 0 and v_paid >= v_total - 0.005 then 'paid'
    when v_paid > 0 then 'partial'
    else 'scheduled'
  end;

  update public.sales_commissions
  set status = v_status, updated_at = now()
  where id = v_installment.commission_id;

  v_receipt := public.upsert_sales_commission_receipt(p_installment_id);
  return v_receipt;
end;
$$;

create or replace function public.issue_sales_commission_receipt(
  p_installment_id uuid
)
returns public.sales_commission_receipts
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.upsert_sales_commission_receipt(p_installment_id);
end;
$$;

create or replace function public.undo_sales_commission_payment(
  p_installment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installment public.sales_commission_installments%rowtype;
  v_total numeric(18,2);
  v_paid numeric(18,2);
  v_status text;
begin
  if public.sales_commission_access_level() <> 'manage_all' then
    raise exception 'You do not have permission to undo commission payments.';
  end if;

  select * into v_installment
  from public.sales_commission_installments
  where id = p_installment_id
  for update;

  if not found then
    raise exception 'Commission installment was not found.';
  end if;

  update public.sales_commission_installments
  set
    status = 'scheduled',
    paid_amount = 0,
    paid_date = null,
    payment_reference = null,
    updated_at = now()
  where id = p_installment_id;

  update public.sales_commission_receipts
  set
    status = 'void',
    voided_at = now(),
    voided_by = auth.uid(),
    updated_at = now()
  where installment_id = p_installment_id
    and status <> 'void';

  select
    coalesce(sum(commission_amount), 0),
    coalesce(sum(paid_amount), 0)
  into v_total, v_paid
  from public.sales_commission_installments
  where commission_id = v_installment.commission_id;

  v_status := case
    when v_total > 0 and v_paid >= v_total - 0.005 then 'paid'
    when v_paid > 0 then 'partial'
    else 'scheduled'
  end;

  update public.sales_commissions
  set status = v_status, updated_at = now()
  where id = v_installment.commission_id;

  return true;
end;
$$;

grant execute on function public.upsert_sales_commission_receipt(uuid) to authenticated;
grant execute on function public.record_sales_commission_payment(uuid,date,text,text) to authenticated;
grant execute on function public.issue_sales_commission_receipt(uuid) to authenticated;
grant execute on function public.undo_sales_commission_payment(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Verification
select
  to_regclass('public.sales_commission_receipts') as receipt_table,
  to_regprocedure('public.record_sales_commission_payment(uuid,date,text,text)') as payment_function,
  to_regprocedure('public.issue_sales_commission_receipt(uuid)') as issue_function,
  to_regprocedure('public.undo_sales_commission_payment(uuid)') as undo_function;
