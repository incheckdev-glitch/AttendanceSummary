-- Persist sales commission rate mode and calculated amount independently from type.

begin;

alter table public.sales_commissions
  add column if not exists commission_rate_mode text,
  add column if not exists commission_amount numeric(18,2);

update public.sales_commissions
set commission_rate_mode = case
      when coalesce(to_jsonb(sales_commissions)->>'commission_rate_type', '') = 'custom' or commission_type = 'custom' then 'custom'
      else 'preset'
    end,
    commission_amount = coalesce(commission_amount, commission_total),
    commission_type = case when commission_type = 'renewal' then 'renewal' else 'first_year' end
where commission_rate_mode is null
   or commission_amount is null
   or commission_type = 'custom';

alter table public.sales_commissions
  alter column commission_rate_mode set default 'preset',
  alter column commission_rate_mode set not null,
  alter column commission_amount set default 0,
  alter column commission_amount set not null;

alter table public.sales_commissions
  drop constraint if exists sales_commissions_type_chk,
  drop constraint if exists sales_commissions_rate_mode_chk,
  drop constraint if exists sales_commissions_custom_type_chk;

alter table public.sales_commissions
  add constraint sales_commissions_type_chk
    check (commission_type in ('first_year', 'renewal')),
  add constraint sales_commissions_rate_mode_chk
    check (commission_rate_mode in ('preset', 'custom'));

comment on column public.sales_commissions.commission_rate_mode is
  'Whether commission_rate was selected from a preset or entered manually.';
comment on column public.sales_commissions.commission_amount is
  'Calculated commission amount saved by the commission form.';

commit;
