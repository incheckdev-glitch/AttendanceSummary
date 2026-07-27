-- InCheck360 HR: full access for General Manager and Senior Financial Controller.
-- Run once in the Supabase SQL Editor before deploying the frontend files.
-- This preserves all existing HR data and only updates role_permissions.

begin;

create extension if not exists pgcrypto;

do $$
declare
  v_gm_roles integer := 0;
  v_sfc_roles integer := 0;
  v_role record;
  v_permission record;
begin
  if to_regclass('public.roles') is null then
    raise exception 'Required table public.roles does not exist.';
  end if;

  if to_regclass('public.role_permissions') is null then
    raise exception 'Required table public.role_permissions does not exist.';
  end if;

  select count(*)
    into v_gm_roles
  from public.roles r
  where lower(regexp_replace(trim(coalesce(r.role_key::text, '')), '[\s-]+', '_', 'g'))
        in ('gm', 'general_manager', 'generalmanager');

  select count(*)
    into v_sfc_roles
  from public.roles r
  where lower(regexp_replace(trim(coalesce(r.role_key::text, '')), '[\s-]+', '_', 'g'))
        in (
          'sfc',
          'senior_fc',
          'financial_controller',
          'senior_financial_controller',
          'senior_finanical_controller',
          'senior_financial_controler',
          'senior_financial_cotroleer'
        );

  if v_gm_roles = 0 then
    raise exception 'No General Manager role was found in public.roles.';
  end if;

  if v_sfc_roles = 0 then
    raise exception 'No Senior Financial Controller role was found in public.roles.';
  end if;

  for v_role in
    select r.role_key::text as role_key
    from public.roles r
    where lower(regexp_replace(trim(coalesce(r.role_key::text, '')), '[\s-]+', '_', 'g'))
          in (
            'gm',
            'general_manager',
            'generalmanager',
            'sfc',
            'senior_fc',
            'financial_controller',
            'senior_financial_controller',
            'senior_finanical_controller',
            'senior_financial_controler',
            'senior_financial_cotroleer'
          )
  loop
    for v_permission in
      select *
      from (values
        ('hr','view'),('hr','list'),('hr','get'),('hr','create'),('hr','update'),('hr','delete'),('hr','manage'),('hr','export'),('hr','print'),('hr','manage_attendance'),
        ('hr_attendance','view'),('hr_attendance','list'),('hr_attendance','get'),('hr_attendance','create'),('hr_attendance','update'),('hr_attendance','delete'),('hr_attendance','export'),('hr_attendance','manage'),
        ('hr_leave','view'),('hr_leave','list'),('hr_leave','get'),('hr_leave','create'),('hr_leave','update'),('hr_leave','approve'),('hr_leave','reject'),('hr_leave','delete'),('hr_leave','export'),('hr_leave','manage'),
        ('hr_leave_balance','view'),('hr_leave_balance','list'),('hr_leave_balance','get'),('hr_leave_balance','create'),('hr_leave_balance','update'),('hr_leave_balance','delete'),('hr_leave_balance','export'),('hr_leave_balance','manage'),
        ('hr_holidays','view'),('hr_holidays','list'),('hr_holidays','get'),('hr_holidays','create'),('hr_holidays','update'),('hr_holidays','delete'),('hr_holidays','export'),('hr_holidays','manage'),
        ('hr_payroll','view'),('hr_payroll','list'),('hr_payroll','get'),('hr_payroll','create'),('hr_payroll','update'),('hr_payroll','delete'),('hr_payroll','generate'),('hr_payroll','review'),('hr_payroll','approve'),('hr_payroll','pay'),('hr_payroll','print'),('hr_payroll','export'),('hr_payroll','manage'),
        ('hr_salary_receipts','view'),('hr_salary_receipts','list'),('hr_salary_receipts','get'),('hr_salary_receipts','create'),('hr_salary_receipts','update'),('hr_salary_receipts','delete'),('hr_salary_receipts','print'),('hr_salary_receipts','export'),('hr_salary_receipts','manage'),
        ('hr_documents','view'),('hr_documents','list'),('hr_documents','get'),('hr_documents','create'),('hr_documents','update'),('hr_documents','delete'),('hr_documents','upload'),('hr_documents','download'),('hr_documents','export'),('hr_documents','manage'),
        ('hr.documents','view'),('hr.documents','list'),('hr.documents','get'),('hr.documents','create'),('hr.documents','update'),('hr.documents','delete'),('hr.documents','upload'),('hr.documents','download'),('hr.documents','export'),('hr.documents','manage'),
        ('hr.documents.upload','upload'),('hr.documents.upload','download'),('hr.documents.upload','manage'),
        ('hr_settings','view'),('hr_settings','list'),('hr_settings','get'),('hr_settings','create'),('hr_settings','update'),('hr_settings','delete'),('hr_settings','manage'),
        ('hr_notifications','view'),('hr_notifications','list'),('hr_notifications','get'),('hr_notifications','create'),('hr_notifications','update'),('hr_notifications','delete'),('hr_notifications','manage'),
        ('hr_self_service','view'),('hr_self_service','list'),('hr_self_service','get'),('hr_self_service','create'),('hr_self_service','update'),('hr_self_service','delete'),('hr_self_service','manage'),
        ('hr_team','view'),('hr_team','list'),('hr_team','get'),('hr_team','create'),('hr_team','update'),('hr_team','delete'),('hr_team','manage'),
        ('hr_attendance_correction','view'),('hr_attendance_correction','list'),('hr_attendance_correction','get'),('hr_attendance_correction','create'),('hr_attendance_correction','update'),('hr_attendance_correction','approve'),('hr_attendance_correction','reject'),('hr_attendance_correction','delete'),('hr_attendance_correction','manage'),
        ('hr_overtime','view'),('hr_overtime','list'),('hr_overtime','get'),('hr_overtime','create'),('hr_overtime','update'),('hr_overtime','approve'),('hr_overtime','reject'),('hr_overtime','delete'),('hr_overtime','manage'),
        ('hr_employee_statement','view'),('hr_employee_statement','list'),('hr_employee_statement','get'),('hr_employee_statement','print'),('hr_employee_statement','export'),('hr_employee_statement','manage'),
        ('hr.employee_statement','view'),('hr.employee_statement','list'),('hr.employee_statement','get'),('hr.employee_statement','print'),('hr.employee_statement','export'),('hr.employee_statement','manage'),
        ('hr_statement_of_account','view'),('hr_statement_of_account','list'),('hr_statement_of_account','get'),('hr_statement_of_account','print'),('hr_statement_of_account','export'),('hr_statement_of_account','manage')
      ) as permission_list(resource, action)
    loop
      update public.role_permissions
      set
        is_allowed = true,
        is_active = true,
        allowed_roles = array[v_role.role_key]::text[],
        updated_at = now()
      where role_key::text = v_role.role_key
        and resource::text = v_permission.resource
        and action::text = v_permission.action;

      if not found then
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
        ) values (
          gen_random_uuid(),
          v_role.role_key,
          v_permission.resource,
          v_permission.action,
          true,
          true,
          array[v_role.role_key]::text[],
          now(),
          now()
        );
      end if;
    end loop;
  end loop;
end
$$;

-- Verification summary: every returned role should have HR permissions.
select
  rp.role_key,
  count(*) as active_hr_permissions
from public.role_permissions rp
where coalesce(rp.is_active, true) = true
  and coalesce(rp.is_allowed, true) = true
  and (
    rp.resource::text = 'hr'
    or rp.resource::text like 'hr_%'
    or rp.resource::text like 'hr.%'
  )
  and lower(regexp_replace(trim(coalesce(rp.role_key::text, '')), '[\s-]+', '_', 'g'))
      in (
        'gm',
        'general_manager',
        'generalmanager',
        'sfc',
        'senior_fc',
        'financial_controller',
        'senior_financial_controller',
        'senior_finanical_controller',
        'senior_financial_controler',
        'senior_financial_cotroleer'
      )
group by rp.role_key
order by rp.role_key;

commit;
