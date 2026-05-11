-- Discount workflow support for agreement amendments and sub-agreements.

alter table public.workflow_approvals
  add column if not exists record_reference text;

alter table public.workflow_audit_log
  add column if not exists record_reference text;

alter table public.agreements
  add column if not exists approved_annual_saas_discount_percent numeric,
  add column if not exists approved_one_time_fee_discount_percent numeric,
  add column if not exists approved_discount_percent numeric,
  add column if not exists discount_approval_status text,
  add column if not exists discount_approved_at timestamptz,
  add column if not exists discount_approved_by text,
  add column if not exists last_discount_approval_request_id text,
  add column if not exists approval_required_reason text;

alter table public.agreement_amendments
  add column if not exists approved_annual_saas_discount_percent numeric,
  add column if not exists approved_one_time_fee_discount_percent numeric,
  add column if not exists approved_discount_percent numeric,
  add column if not exists discount_approval_status text,
  add column if not exists discount_approved_at timestamptz,
  add column if not exists discount_approved_by text,
  add column if not exists last_discount_approval_request_id text,
  add column if not exists approval_required_reason text;

create index if not exists idx_workflow_approvals_resource_record_pending
on public.workflow_approvals (resource, record_id, status);

create index if not exists idx_workflow_approvals_record_reference
on public.workflow_approvals (record_reference);

insert into public.workflow_rules (
  resource,
  current_status,
  next_status,
  allowed_roles,
  requires_approval,
  approval_role,
  approval_roles,
  max_discount_percent,
  hard_stop_discount_percent,
  is_active
)
select
  'agreement_amendment',
  null,
  null,
  array['sales_executive','head_of_sales','admin','dev']::text[],
  true,
  'admin',
  array['admin']::text[],
  10,
  20,
  true
where not exists (
  select 1
  from public.workflow_rules
  where resource = 'agreement_amendment'
);
