-- Phase 3 authentication and permission hardening.
-- Rebuild the runtime permission RPC so an authenticated caller can receive
-- only active permission rows for their own active profile role.
--
-- This does not modify role permission data or any module RLS policy.

begin;

drop function if exists public.get_my_role_permissions();

create function public.get_my_role_permissions()
returns table (
  role_key text,
  resource text,
  action text,
  is_allowed boolean,
  is_active boolean,
  allowed_roles text[]
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with current_profile as (
    select lower(
      regexp_replace(
        trim(coalesce(p.role_key::text, '')),
        '[\s-]+',
        '_',
        'g'
      )
    ) as normalized_role_key
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, false) = true
      and nullif(trim(coalesce(p.role_key::text, '')), '') is not null
    limit 1
  )
  select
    rp.role_key::text,
    rp.resource::text,
    rp.action::text,
    coalesce(rp.is_allowed, true)::boolean,
    coalesce(rp.is_active, true)::boolean,
    coalesce(rp.allowed_roles::text[], array[rp.role_key::text]::text[])
  from public.role_permissions rp
  join current_profile cp
    on lower(
      regexp_replace(
        trim(coalesce(rp.role_key::text, '')),
        '[\s-]+',
        '_',
        'g'
      )
    ) = cp.normalized_role_key
  where coalesce(rp.is_active, true) = true
  order by lower(coalesce(rp.resource::text, '')),
           lower(coalesce(rp.action::text, ''));
$$;

revoke all on function public.get_my_role_permissions() from public;
revoke all on function public.get_my_role_permissions() from anon;
revoke all on function public.get_my_role_permissions() from authenticated;
grant execute on function public.get_my_role_permissions() to authenticated;

comment on function public.get_my_role_permissions() is
  'Returns active runtime permission rows only for the signed-in active profile role.';

commit;
