-- Hardware section support for invoices, receipts, and proposal discount workflow.
-- Run this before deploying the frontend patch if these columns do not already exist.

alter table if exists public.workflow_rules
  add column if not exists hardware_no_approval_until_percent numeric default 20,
  add column if not exists hardware_hard_stop_discount_percent numeric default 30;

alter table if exists public.proposals
  add column if not exists approved_hardware_discount_percent numeric;

-- Keep existing proposal workflow rows usable for the new Hardware category.
update public.workflow_rules
set
  hardware_no_approval_until_percent = coalesce(hardware_no_approval_until_percent, one_time_fee_no_approval_until_percent, 20),
  hardware_hard_stop_discount_percent = coalesce(hardware_hard_stop_discount_percent, one_time_fee_hard_stop_discount_percent, 30)
where lower(coalesce(resource, '')) in ('proposal', 'proposals');
