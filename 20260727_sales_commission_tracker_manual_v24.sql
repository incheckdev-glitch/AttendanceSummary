-- InCheck360 CRM · Manual Sales Commission Tracker
-- Creates manual invoice-based commissions and term-based commission payment installments.
-- First-year default: 5%. Renewal default: 2.5%.

begin;

create extension if not exists pgcrypto;

create table if not exists public.sales_commissions (
  id uuid primary key default gen_random_uuid(),
  invoice_id text,
  invoice_number text not null,
  client_id text,
  client_name text,
  salesperson_id uuid,
  salesperson_name text not null,
  salesperson_email text,
  commission_type text not null default 'first_year',
  commission_rate numeric(7,4) not null default 5,
  invoice_value numeric(18,2) not null default 0,
  commissionable_amount numeric(18,2) not null default 0,
  commission_total numeric(18,2) not null default 0,
  currency text not null default 'USD',
  payment_term text,
  invoice_date date,
  invoice_due_date date,
  installment_count integer not null default 1,
  status text not null default 'scheduled',
  notes text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_commissions_type_chk check (commission_type in ('first_year','renewal')),
  constraint sales_commissions_rate_chk check (commission_rate >= 0 and commission_rate <= 100),
  constraint sales_commissions_amounts_chk check (invoice_value >= 0 and commissionable_amount >= 0 and commission_total >= 0),
  constraint sales_commissions_installment_count_chk check (installment_count between 1 and 24),
  constraint sales_commissions_status_chk check (status in ('scheduled','partial','paid','cancelled'))
);

create unique index if not exists sales_commissions_invoice_number_uidx
  on public.sales_commissions (lower(btrim(invoice_number)))
  where invoice_number is not null and btrim(invoice_number) <> '';

create index if not exists sales_commissions_salesperson_idx on public.sales_commissions (salesperson_id);
create index if not exists sales_commissions_status_idx on public.sales_commissions (status);
create index if not exists sales_commissions_invoice_date_idx on public.sales_commissions (invoice_date desc);

create table if not exists public.sales_commission_installments (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.sales_commissions(id) on delete cascade,
  installment_no integer not null,
  schedule_label text,
  source_schedule_id text,
  due_date date,
  commission_amount numeric(18,2) not null default 0,
  paid_amount numeric(18,2) not null default 0,
  status text not null default 'scheduled',
  paid_date date,
  payment_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_commission_installments_no_chk check (installment_no >= 1),
  constraint sales_commission_installments_amount_chk check (commission_amount >= 0 and paid_amount >= 0 and paid_amount <= commission_amount),
  constraint sales_commission_installments_status_chk check (status in ('scheduled','paid','held','cancelled')),
  constraint sales_commission_installments_unique_no unique (commission_id, installment_no)
);

create index if not exists sales_commission_installments_due_idx on public.sales_commission_installments (due_date);
create index if not exists sales_commission_installments_status_idx on public.sales_commission_installments (status);

create or replace function public.sales_commission_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(regexp_replace(trim(coalesce(
    (select p.role_key::text from public.profiles p where p.id = auth.uid() limit 1),
    auth.jwt()->'app_metadata'->>'role',
    auth.jwt()->'user_metadata'->>'role',
    ''
  )), '[\s-]+', '_', 'g'));
$$;

grant execute on function public.sales_commission_current_role() to authenticated;

alter table public.sales_commissions enable row level security;
alter table public.sales_commission_installments enable row level security;

drop policy if exists sales_commissions_select_policy on public.sales_commissions;
create policy sales_commissions_select_policy
on public.sales_commissions for select
to authenticated
using (
  public.sales_commission_current_role() in (
    'admin','dev','developer','head_of_sales','sales_manager','general_manager','gm',
    'senior_financial_controller','senior_fc','sfc','financial_controller',
    'accounting','accountant'
  )
  or salesperson_id = auth.uid()
  or created_by = auth.uid()
);

drop policy if exists sales_commissions_insert_policy on public.sales_commissions;
create policy sales_commissions_insert_policy
on public.sales_commissions for insert
to authenticated
with check (
  public.sales_commission_current_role() in (
    'admin','dev','developer','head_of_sales','sales_manager','general_manager','gm',
    'senior_financial_controller','senior_fc','sfc','financial_controller',
    'accounting','accountant'
  )
);

drop policy if exists sales_commissions_update_policy on public.sales_commissions;
create policy sales_commissions_update_policy
on public.sales_commissions for update
to authenticated
using (
  public.sales_commission_current_role() in (
    'admin','dev','developer','head_of_sales','sales_manager','general_manager','gm',
    'senior_financial_controller','senior_fc','sfc','financial_controller',
    'accounting','accountant'
  )
)
with check (
  public.sales_commission_current_role() in (
    'admin','dev','developer','head_of_sales','sales_manager','general_manager','gm',
    'senior_financial_controller','senior_fc','sfc','financial_controller',
    'accounting','accountant'
  )
);

drop policy if exists sales_commissions_delete_policy on public.sales_commissions;
create policy sales_commissions_delete_policy
on public.sales_commissions for delete
to authenticated
using (
  public.sales_commission_current_role() in (
    'admin','dev','developer','head_of_sales','sales_manager','general_manager','gm',
    'senior_financial_controller','senior_fc','sfc','financial_controller',
    'accounting','accountant'
  )
);

drop policy if exists sales_commission_installments_select_policy on public.sales_commission_installments;
create policy sales_commission_installments_select_policy
on public.sales_commission_installments for select
to authenticated
using (
  exists (
    select 1 from public.sales_commissions c
    where c.id = commission_id
      and (
        public.sales_commission_current_role() in (
          'admin','dev','developer','head_of_sales','sales_manager','general_manager','gm',
          'senior_financial_controller','senior_fc','sfc','financial_controller',
          'accounting','accountant'
        )
        or c.salesperson_id = auth.uid()
        or c.created_by = auth.uid()
      )
  )
);

drop policy if exists sales_commission_installments_insert_policy on public.sales_commission_installments;
create policy sales_commission_installments_insert_policy
on public.sales_commission_installments for insert
to authenticated
with check (
  public.sales_commission_current_role() in (
    'admin','dev','developer','head_of_sales','sales_manager','general_manager','gm',
    'senior_financial_controller','senior_fc','sfc','financial_controller',
    'accounting','accountant'
  )
);

drop policy if exists sales_commission_installments_update_policy on public.sales_commission_installments;
create policy sales_commission_installments_update_policy
on public.sales_commission_installments for update
to authenticated
using (
  public.sales_commission_current_role() in (
    'admin','dev','developer','head_of_sales','sales_manager','general_manager','gm',
    'senior_financial_controller','senior_fc','sfc','financial_controller',
    'accounting','accountant'
  )
)
with check (
  public.sales_commission_current_role() in (
    'admin','dev','developer','head_of_sales','sales_manager','general_manager','gm',
    'senior_financial_controller','senior_fc','sfc','financial_controller',
    'accounting','accountant'
  )
);

drop policy if exists sales_commission_installments_delete_policy on public.sales_commission_installments;
create policy sales_commission_installments_delete_policy
on public.sales_commission_installments for delete
to authenticated
using (
  public.sales_commission_current_role() in (
    'admin','dev','developer','head_of_sales','sales_manager','general_manager','gm',
    'senior_financial_controller','senior_fc','sfc','financial_controller',
    'accounting','accountant'
  )
);

grant select, insert, update, delete on public.sales_commissions to authenticated;
grant select, insert, update, delete on public.sales_commission_installments to authenticated;

-- Add app permission rows for roles that already exist in this deployment.
do $$
declare
  v_role record;
  v_permission record;
begin
  if to_regclass('public.roles') is not null and to_regclass('public.role_permissions') is not null then
    for v_role in
      select r.role_key::text as role_key
      from public.roles r
      where lower(regexp_replace(trim(coalesce(r.role_key::text,'')), '[\s-]+', '_', 'g')) in (
        'admin','dev','developer','head_of_sales','sales_manager','sales_executive',
        'general_manager','gm','senior_financial_controller','senior_fc','sfc',
        'financial_controller','accounting','accountant'
      )
    loop
      for v_permission in
        select * from (values
          ('sales_commissions','view'),
          ('sales_commissions','list'),
          ('sales_commissions','get'),
          ('sales_commissions','export'),
          ('sales_commission_installments','view'),
          ('sales_commission_installments','list'),
          ('sales_commission_installments','get')
        ) as p(resource,action)
      loop
        update public.role_permissions
        set is_allowed=true,is_active=true,allowed_roles=array[v_role.role_key]::text[],updated_at=now()
        where role_key::text=v_role.role_key and resource::text=v_permission.resource and action::text=v_permission.action;
        if not found then
          insert into public.role_permissions(permission_id,role_key,resource,action,is_allowed,is_active,allowed_roles,created_at,updated_at)
          values(gen_random_uuid(),v_role.role_key,v_permission.resource,v_permission.action,true,true,array[v_role.role_key]::text[],now(),now());
        end if;
      end loop;

      if lower(regexp_replace(trim(v_role.role_key), '[\s-]+', '_', 'g')) <> 'sales_executive' then
        for v_permission in
          select * from (values
            ('sales_commissions','create'),('sales_commissions','update'),('sales_commissions','delete'),('sales_commissions','manage'),
            ('sales_commission_installments','create'),('sales_commission_installments','update'),('sales_commission_installments','delete'),('sales_commission_installments','manage'),('sales_commission_installments','pay')
          ) as p(resource,action)
        loop
          update public.role_permissions
          set is_allowed=true,is_active=true,allowed_roles=array[v_role.role_key]::text[],updated_at=now()
          where role_key::text=v_role.role_key and resource::text=v_permission.resource and action::text=v_permission.action;
          if not found then
            insert into public.role_permissions(permission_id,role_key,resource,action,is_allowed,is_active,allowed_roles,created_at,updated_at)
            values(gen_random_uuid(),v_role.role_key,v_permission.resource,v_permission.action,true,true,array[v_role.role_key]::text[],now(),now());
          end if;
        end loop;
      end if;
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- Verification
select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('sales_commissions','sales_commission_installments')
order by table_name;
