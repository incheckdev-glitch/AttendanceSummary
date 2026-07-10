-- SFC full access to Accounting Foundation
-- Gives SFC/Senior Financial Controller full accounting permissions.
-- Safe: inserts only role keys that already exist in public.roles.

begin;

create extension if not exists pgcrypto;

with wanted(role_key, resource, action) as (
  select r.role_key, res.resource, act.action
  from public.roles r
  cross join (
    values
      ('accounting'),
      ('accounting_accounts'),
      ('accounting_journals'),
      ('accounting_ledger'),
      ('accounting_bank'),
      ('accounting_reports'),
      ('accounting_expenses'),
      ('accounting_vendors'),
      ('accounting_vendor_bills'),
      ('accounting_vendor_payments'),
      ('accounting_tax_rates'),
      ('accounting_cost_centers'),
      ('accounting_closing_periods'),
      ('accounting_bank_reconciliations'),
      ('accounting_audit_log')
  ) as res(resource)
  cross join (
    values
      ('view'),
      ('list'),
      ('get'),
      ('export'),
      ('create'),
      ('save'),
      ('update'),
      ('edit'),
      ('delete'),
      ('post'),
      ('approve'),
      ('manage')
  ) as act(action)
  where r.role_key in (
    'sfc',
    'senior_financial_controller',
    'senior_finanical_controller'
  )
)
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
  role_key,
  resource,
  action,
  true,
  true,
  array[role_key]::text[],
  now(),
  now()
from wanted
on conflict (role_key, resource, action)
do update set
  is_allowed = true,
  is_active = true,
  allowed_roles = array[excluded.role_key]::text[],
  updated_at = now();

-- Verification
select
  role_key,
  resource,
  action,
  is_allowed,
  is_active
from public.role_permissions
where role_key in (
  'sfc',
  'senior_financial_controller',
  'senior_finanical_controller'
)
and resource like 'accounting%'
order by role_key, resource, action;

commit;
