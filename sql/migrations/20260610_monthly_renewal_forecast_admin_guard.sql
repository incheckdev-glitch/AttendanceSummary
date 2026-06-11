-- Monthly Renewal Forecast is restricted to authenticated admin users only.
-- Invoice items joined to their invoice headers are the sole renewal-opportunity
-- source. Agreement and client rows are returned only to enrich display labels.

create or replace function public.crm_is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and lower(trim(coalesce(profile.role_key, ''))) = 'admin'
    );
$$;

revoke all on function public.crm_is_admin_user() from public, anon;
grant execute on function public.crm_is_admin_user() to authenticated;

create or replace function public.crm_get_monthly_renewal_forecast()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.crm_is_admin_user() then
    raise exception 'Access denied. Admin only.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'invoice_items', (
      select coalesce(jsonb_agg(source_row.payload), '[]'::jsonb)
      from (
        select to_jsonb(item_row) || jsonb_strip_nulls(jsonb_build_object(
          'invoice_number', coalesce(to_jsonb(invoice_row)->>'invoice_number', to_jsonb(invoice_row)->>'invoice_no', to_jsonb(invoice_row)->>'number'),
          'company_id', coalesce(to_jsonb(item_row)->>'company_id', to_jsonb(invoice_row)->>'company_id'),
          'company_uuid', coalesce(to_jsonb(item_row)->>'company_uuid', to_jsonb(invoice_row)->>'company_uuid'),
          'client_id', coalesce(to_jsonb(item_row)->>'client_id', to_jsonb(invoice_row)->>'client_id'),
          'client_name', coalesce(to_jsonb(item_row)->>'client_name', to_jsonb(invoice_row)->>'client_name'),
          'company_name', coalesce(to_jsonb(item_row)->>'company_name', to_jsonb(invoice_row)->>'company_name'),
          'agreement_id', coalesce(to_jsonb(item_row)->>'agreement_id', to_jsonb(invoice_row)->>'agreement_id'),
          'agreement_uuid', coalesce(to_jsonb(item_row)->>'agreement_uuid', to_jsonb(invoice_row)->>'agreement_uuid'),
          'agreement_number', coalesce(to_jsonb(item_row)->>'agreement_number', to_jsonb(invoice_row)->>'agreement_number'),
          'currency', coalesce(to_jsonb(item_row)->>'currency', to_jsonb(invoice_row)->>'currency')
        )) as payload
        from public.invoice_items item_row
        left join public.invoices invoice_row
          on coalesce(to_jsonb(item_row)->>'invoice_id', to_jsonb(item_row)->>'invoice_uuid') = coalesce(to_jsonb(invoice_row)->>'id', to_jsonb(invoice_row)->>'invoice_id', to_jsonb(invoice_row)->>'invoice_uuid')
      ) source_row
    ),
    'agreements', (select coalesce(jsonb_agg(to_jsonb(source_row)), '[]'::jsonb) from (select * from public.agreements limit 5000) source_row),
    'clients', (select coalesce(jsonb_agg(to_jsonb(source_row)), '[]'::jsonb) from (select * from public.clients limit 5000) source_row)
  );
end;
$$;

revoke all on function public.crm_get_monthly_renewal_forecast() from public;
revoke all on function public.crm_get_monthly_renewal_forecast() from anon;
grant execute on function public.crm_get_monthly_renewal_forecast() to authenticated;
