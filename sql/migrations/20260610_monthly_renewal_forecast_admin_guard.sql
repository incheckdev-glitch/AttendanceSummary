-- Monthly Renewal Forecast is restricted to authenticated admin users only.
-- The browser builds the forecast from this RPC payload so non-admin callers
-- cannot use the forecast endpoint to read its source records.

create or replace function public.crm_get_monthly_renewal_forecast()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_key text := '';
begin
  if auth.uid() is not null then
    select lower(trim(coalesce(profile.role_key, '')))
      into v_role_key
    from public.profiles profile
    where profile.id = auth.uid()
    limit 1;
  end if;

  if auth.uid() is null or v_role_key <> 'admin' then
    raise exception 'Access denied. Admin only.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'agreement_items', (select coalesce(jsonb_agg(to_jsonb(source_row)), '[]'::jsonb) from (select * from public.agreement_items limit 5000) source_row),
    'invoice_items', (select coalesce(jsonb_agg(to_jsonb(source_row)), '[]'::jsonb) from (select * from public.invoice_items limit 5000) source_row),
    'agreements', (select coalesce(jsonb_agg(to_jsonb(source_row)), '[]'::jsonb) from (select * from public.agreements limit 5000) source_row),
    'invoices', (select coalesce(jsonb_agg(to_jsonb(source_row)), '[]'::jsonb) from (select * from public.invoices limit 5000) source_row),
    'clients', (select coalesce(jsonb_agg(to_jsonb(source_row)), '[]'::jsonb) from (select * from public.clients limit 5000) source_row)
  );
end;
$$;

revoke all on function public.crm_get_monthly_renewal_forecast() from public;
revoke all on function public.crm_get_monthly_renewal_forecast() from anon;
grant execute on function public.crm_get_monthly_renewal_forecast() to authenticated;
