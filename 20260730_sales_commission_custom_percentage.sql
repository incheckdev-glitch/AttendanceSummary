-- Sales Commission · Custom commission percentages and verified persistence
-- Keeps commission_type for the business type and stores preset/custom in commission_rate_mode.

begin;

alter table public.sales_commissions
  add column if not exists commission_rate_mode text,
  add column if not exists commission_amount numeric(18,2);

-- Remove constraints introduced by older incompatible attempts before normalizing data.
alter table public.sales_commissions
  drop constraint if exists sales_commissions_type_chk,
  drop constraint if exists sales_commissions_commission_type_check,
  drop constraint if exists sales_commissions_rate_type_chk,
  drop constraint if exists sales_commissions_rate_mode_chk,
  drop constraint if exists sales_commissions_rate_chk,
  drop constraint if exists sales_commissions_percentage_check,
  drop constraint if exists sales_commissions_custom_type_chk;

-- Preserve the original business meaning of commission_type.
update public.sales_commissions
set commission_rate_mode = case
      when coalesce(commission_rate_mode, '') in ('preset','custom') then commission_rate_mode
      when coalesce(to_jsonb(sales_commissions)->>'commission_rate_type','') = 'custom' then 'custom'
      when commission_type = 'custom' then 'custom'
      else 'preset'
    end,
    commission_type = case when commission_type = 'renewal' then 'renewal' else 'first_year' end,
    commission_amount = coalesce(commission_amount, commission_total, 0);

alter table public.sales_commissions
  alter column commission_rate type numeric(5,2) using round(coalesce(commission_rate,0)::numeric,2),
  alter column commission_rate_mode set default 'preset',
  alter column commission_rate_mode set not null,
  alter column commission_amount set default 0,
  alter column commission_amount set not null;

alter table public.sales_commissions
  add constraint sales_commissions_type_chk
    check (commission_type in ('first_year','renewal')),
  add constraint sales_commissions_rate_mode_chk
    check (commission_rate_mode in ('preset','custom')),
  add constraint sales_commissions_rate_chk
    check (commission_rate >= 0 and commission_rate <= 100);

comment on column public.sales_commissions.commission_type is
  'Business commission type: first_year or renewal.';
comment on column public.sales_commissions.commission_rate_mode is
  'Rate entry mode: preset or custom.';
comment on column public.sales_commissions.commission_rate is
  'Final percentage used for the commission calculation.';
comment on column public.sales_commissions.commission_amount is
  'Calculated commission amount persisted by the form.';

commit;

-- Verification result
select
  column_name,
  data_type,
  numeric_precision,
  numeric_scale,
  column_default,
  is_nullable
from information_schema.columns
where table_schema='public'
  and table_name='sales_commissions'
  and column_name in ('commission_type','commission_rate_mode','commission_rate','commission_amount')
order by ordinal_position;
