begin;

delete from public.role_permissions
where lower(coalesce(resource, '')) in ('operations_onboarding', 'operations-onboarding')
   or lower(coalesce(resource, '')) like '%operations_onboarding%';

do $$
begin
  if to_regclass('public.notification_settings') is not null then
    update public.notification_settings
    set is_enabled = false,
        updated_at = now()
    where lower(coalesce(resource, '')) = 'operations_onboarding'
       or lower(coalesce(event_type, '')) like '%operations_onboarding%'
       or lower(coalesce(event_key, '')) like '%operations_onboarding%';
  end if;

  if to_regclass('public.notification_event_types') is not null then
    update public.notification_event_types
    set is_enabled = false,
        updated_at = now()
    where lower(coalesce(resource, '')) = 'operations_onboarding'
       or lower(coalesce(event_type, '')) like '%operations_onboarding%'
       or lower(coalesce(event_key, '')) like '%operations_onboarding%';
  end if;
end $$;

do $$
begin
  if to_regclass('public.operations_onboarding') is not null then
    alter table public.operations_onboarding enable row level security;
  end if;
end $$;

commit;
