-- Expose Monthly Renewal Forecast in the app permission matrix while keeping its RPCs admin-only.
-- Payment Forecast permissions are intentionally untouched.

do $$
declare
  protected_rpc text;
  function_definition text;
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
      role_row.role_key,
      'monthly_renewal_forecast',
      action_row.action,
      lower(trim(role_row.role_key)) = 'admin',
      true,
      case when lower(trim(role_row.role_key)) = 'admin' then array['admin']::text[] else array[]::text[] end,
      now(),
      now()
    from public.roles role_row
    cross join (
      values
        ('view'),
        ('export'),
        ('view_details'),
        ('mark_renewed'),
        ('mark_no_renewal_needed'),
        ('undo_override'),
        ('create_renewal_invoice')
    ) as action_row(action)
    where lower(trim(role_row.role_key)) in (
      'admin',
      'dev',
      'csm',
      'hoo',
      'viewer',
      'sales_executive',
      'head_of_sales',
      'accounting',
      'senior_financial_controller',
      'general_manager'
    )
    on conflict (role_key, resource, action)
    do nothing;
  end if;

  -- Fail closed if an existing protected RPC loses its exact-admin guard.
  foreach protected_rpc in array array[
    'crm_get_monthly_renewal_forecast',
    'crm_get_monthly_renewal_forecast_details',
    'crm_mark_renewal_manual',
    'crm_mark_renewal_no_needed',
    'crm_unmark_renewal_override',
    'crm_get_renewal_no_needed_overrides'
  ] loop
    for function_definition in
      select pg_get_functiondef(proc.oid)
      from pg_proc proc
      join pg_namespace namespace on namespace.oid = proc.pronamespace
      where namespace.nspname = 'public'
        and proc.proname = protected_rpc
    loop
      if function_definition not ilike '%crm_is_admin_user%'
         and function_definition not ilike '%crm_require_renewal_admin%' then
        raise exception 'Monthly Renewal Forecast RPC public.% must validate admin access using crm_is_admin_user()', protected_rpc;
      end if;
    end loop;
  end loop;
end $$;
