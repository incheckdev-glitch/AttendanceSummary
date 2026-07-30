-- Sales Commission · Custom commission percentages
-- Persists whether a rate came from a preset or manual entry and enforces two-decimal rates.

begin;

alter table public.sales_commissions
  add column if not exists commission_rate_type text;

update public.sales_commissions
set commission_rate_type = case when commission_type = 'custom' then 'custom' else 'preset' end
where commission_rate_type is null;

alter table public.sales_commissions
  alter column commission_rate_type set default 'preset',
  alter column commission_rate_type set not null,
  alter column commission_rate type numeric(5,2) using round(commission_rate::numeric, 2);

alter table public.sales_commissions
  drop constraint if exists sales_commissions_type_chk,
  drop constraint if exists sales_commissions_rate_type_chk,
  drop constraint if exists sales_commissions_rate_chk,
  drop constraint if exists sales_commissions_custom_type_chk;

alter table public.sales_commissions
  add constraint sales_commissions_type_chk
    check (commission_type in ('first_year', 'renewal', 'custom')),
  add constraint sales_commissions_rate_type_chk
    check (commission_rate_type in ('preset', 'custom')),
  add constraint sales_commissions_rate_chk
    check (commission_rate >= 0 and commission_rate <= 100),
  add constraint sales_commissions_custom_type_chk
    check ((commission_type = 'custom') = (commission_rate_type = 'custom'));

comment on column public.sales_commissions.commission_rate_type is
  'Whether commission_rate was selected from a preset or entered as a custom percentage.';
comment on column public.sales_commissions.commission_rate is
  'Final percentage used to calculate commission_total; limited to two decimal places.';

commit;
