-- Credit Notes accounting document type.
-- Apply after invoice/receipt migrations.

create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  credit_note_id text unique,
  credit_note_number text unique,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  invoice_number text,
  agreement_uuid uuid,
  agreement_id uuid,
  agreement_number text,
  client_id uuid,
  company_id uuid,
  company_name text,
  customer_name text,
  client_name text,
  customer_legal_name text,
  credit_note_date date not null,
  description text not null,
  currency text not null default 'USD',
  credit_amount numeric(14,2) not null check (credit_amount > 0),
  status text not null default 'issued' check (status in ('issued','cancelled','void')),
  created_by uuid,
  created_by_email text,
  updated_by uuid,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_notes_invoice_id_idx on public.credit_notes(invoice_id);
create index if not exists credit_notes_status_idx on public.credit_notes(status);
create index if not exists credit_notes_date_idx on public.credit_notes(credit_note_date);

alter table public.invoices add column if not exists credit_note_amount numeric(14,2) not null default 0;

create or replace function public.next_credit_note_number(p_date date default current_date)
returns text
language plpgsql
as $$
declare
  y text := to_char(coalesce(p_date, current_date), 'YYYY');
  n integer;
begin
  select coalesce(max(nullif(regexp_replace(credit_note_number, '^CN/' || y || '/', ''), '')::integer), 0) + 1
    into n
    from public.credit_notes
   where credit_note_number ~ ('^CN/' || y || '/[0-9]+$');
  return 'CN/' || y || '/' || n::text;
end;
$$;

create or replace function public.credit_notes_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.credit_note_number is null or btrim(new.credit_note_number) = '' then
    new.credit_note_number := public.next_credit_note_number(new.credit_note_date);
  end if;
  if new.credit_note_id is null or btrim(new.credit_note_id) = '' then
    new.credit_note_id := new.credit_note_number;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_credit_notes_before_insert on public.credit_notes;
create trigger trg_credit_notes_before_insert
before insert on public.credit_notes
for each row execute function public.credit_notes_before_insert();

create or replace function public.recalculate_invoice_credit_note_totals(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_credit numeric(14,2);
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_balance numeric(14,2);
  v_payment_status text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice % not found', p_invoice_id;
  end if;

  select coalesce(sum(credit_amount), 0) into v_credit
    from public.credit_notes
   where invoice_id = p_invoice_id
     and coalesce(status, 'issued') not in ('cancelled','canceled','void','voided','deleted','rejected');

  v_total := coalesce(v_invoice.grand_total, v_invoice.invoice_total, 0);
  v_paid := coalesce(v_invoice.amount_paid, v_invoice.received_amount, 0);
  v_balance := greatest(v_total - v_paid - v_credit, 0);

  if v_balance <= 0 and v_paid >= v_total and v_paid > 0 then
    v_payment_status := 'Paid';
  elsif v_balance <= 0 and v_credit > 0 then
    v_payment_status := 'Credited';
  elsif v_paid > 0 or v_credit > 0 then
    v_payment_status := 'Partially Paid';
  else
    v_payment_status := 'Unpaid';
  end if;

  update public.invoices
     set credit_note_amount = v_credit,
         pending_amount = v_balance,
         balance_due = v_balance,
         payment_status = case
           when v_payment_status = 'Credited'
            and exists (
              select 1 from information_schema.check_constraints cc
              join information_schema.constraint_column_usage ccu on ccu.constraint_name = cc.constraint_name
              where ccu.table_schema = 'public' and ccu.table_name = 'invoices' and ccu.column_name = 'payment_status'
                and cc.check_clause not ilike '%Credited%'
            ) then 'Paid'
           else v_payment_status
         end,
         payment_state = v_payment_status,
         updated_at = now()
   where id = p_invoice_id
   returning * into v_invoice;

  return v_invoice;
end;
$$;

create or replace function public.credit_notes_after_change()
returns trigger
language plpgsql
as $$
declare
  v_invoice_id uuid;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  perform public.recalculate_invoice_credit_note_totals(v_invoice_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_credit_notes_after_insert_update on public.credit_notes;
create trigger trg_credit_notes_after_insert_update
after insert or update of credit_amount, status, invoice_id on public.credit_notes
for each row execute function public.credit_notes_after_change();

-- Seed Credit Notes permissions into the existing role_permissions system without creating roles.
do $$
begin
  if to_regclass('public.role_permissions') is not null and to_regclass('public.roles') is not null then
    insert into public.role_permissions (
      permission_id,
      role_key,
      resource,
      action,
      is_allowed,
      is_active,
      allowed_roles,
      created_at,
      updated_at
    )
    select
      gen_random_uuid(),
      r.role_key,
      'credit_notes',
      p.action,
      true,
      true,
      array[r.role_key]::text[],
      now(),
      now()
    from public.roles r
    join (
      values
        ('admin', 'view'), ('admin', 'create'), ('admin', 'cancel'), ('admin', 'print'), ('admin', 'export'),
        ('dev', 'view'), ('dev', 'create'), ('dev', 'cancel'), ('dev', 'print'), ('dev', 'export'),
        ('accounting', 'view'), ('accounting', 'create'), ('accounting', 'cancel'), ('accounting', 'print'), ('accounting', 'export'),
        ('accountant', 'view'), ('accountant', 'create'), ('accountant', 'cancel'), ('accountant', 'print'), ('accountant', 'export'),
        ('senior_financial_controller', 'view'), ('senior_financial_controller', 'create'), ('senior_financial_controller', 'cancel'), ('senior_financial_controller', 'print'), ('senior_financial_controller', 'export'),
        ('financial_controller', 'view'), ('financial_controller', 'create'), ('financial_controller', 'cancel'), ('financial_controller', 'print'), ('financial_controller', 'export'),
        ('senior_fc', 'view'), ('senior_fc', 'create'), ('senior_fc', 'cancel'), ('senior_fc', 'print'), ('senior_fc', 'export'),
        ('sfc', 'view'), ('sfc', 'create'), ('sfc', 'cancel'), ('sfc', 'print'), ('sfc', 'export'),
        ('general_manager', 'view'), ('general_manager', 'create'), ('general_manager', 'cancel'), ('general_manager', 'print'), ('general_manager', 'export'),
        ('gm', 'view'), ('gm', 'create'), ('gm', 'cancel'), ('gm', 'print'), ('gm', 'export'),
        ('viewer', 'view'), ('viewer', 'print'),
        ('hoo', 'view'), ('hoo', 'print'),
        ('csm', 'view'), ('csm', 'print'),
        ('customer_success', 'view'), ('customer_success', 'print'),
        ('customer_success_manager', 'view'), ('customer_success_manager', 'print'),
        ('sales_executive', 'view'), ('sales_executive', 'print'),
        ('head_of_sales', 'view'), ('head_of_sales', 'print')
    ) as p(role_key, action) on p.role_key = r.role_key
    on conflict (role_key, resource, action)
    do update set
      is_allowed = excluded.is_allowed,
      is_active = excluded.is_active,
      allowed_roles = excluded.allowed_roles,
      updated_at = now();
  end if;
end $$;
