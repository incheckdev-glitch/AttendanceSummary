-- =========================================================
-- Communication Centre FINAL RPC permission helper fix
-- Root cause fixed: ignore Supabase JWT role values like authenticated/anon
-- so the helper reads the real application role from public.users.
-- Safe to run.
-- =========================================================

create or replace function public.cc_current_app_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_user_id_text text;
begin
  if v_auth_uid is null then
    return null;
  end if;

  if to_regclass('public.users') is not null then
    select to_jsonb(u)->>'id'
    into v_user_id_text
    from public.users u
    where
      to_jsonb(u)->>'id' = v_auth_uid::text
      or to_jsonb(u)->>'auth_user_id' = v_auth_uid::text
      or to_jsonb(u)->>'user_id' = v_auth_uid::text
      or (
        v_email <> ''
        and lower(coalesce(to_jsonb(u)->>'email', '')) = v_email
      )
    limit 1;
  end if;

  if v_user_id_text is not null
     and v_user_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_user_id_text::uuid;
  end if;

  return v_auth_uid;
end;
$$;

create or replace function public.cc_current_role_key()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_role text;
begin
  if v_auth_uid is null then
    return null;
  end if;

  -- IMPORTANT:
  -- Supabase JWT claim "role" is usually "authenticated".
  -- That is NOT the application role. Ignore infrastructure roles.
  v_role := lower(coalesce(
    nullif(auth.jwt()->'app_metadata'->>'role_key', ''),
    nullif(auth.jwt()->'app_metadata'->>'role', ''),
    nullif(auth.jwt()->'user_metadata'->>'role_key', ''),
    nullif(auth.jwt()->'user_metadata'->>'role', '')
  ));

  if v_role in ('authenticated', 'anon', 'service_role', 'supabase_admin') then
    v_role := null;
  end if;

  if v_role is not null and v_role <> '' then
    return v_role;
  end if;

  -- Read the real app role from public.users.
  if to_regclass('public.users') is not null then
    select lower(coalesce(
      nullif(to_jsonb(u)->>'role_key', ''),
      nullif(to_jsonb(u)->>'role', ''),
      nullif(to_jsonb(u)->>'user_role', ''),
      nullif(to_jsonb(u)->>'role_name', '')
    ))
    into v_role
    from public.users u
    where
      to_jsonb(u)->>'id' = v_auth_uid::text
      or to_jsonb(u)->>'auth_user_id' = v_auth_uid::text
      or to_jsonb(u)->>'user_id' = v_auth_uid::text
      or (
        v_email <> ''
        and lower(coalesce(to_jsonb(u)->>'email', '')) = v_email
      )
    limit 1;
  end if;

  if v_role in ('authenticated', 'anon', 'service_role', 'supabase_admin') then
    return null;
  end if;

  return nullif(v_role, '');
end;
$$;

create or replace function public.cc_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(public.cc_current_role_key(), '')) in ('admin', 'administrator', 'super_admin');
$$;

create or replace function public.cc_has_permission(p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := lower(coalesce(public.cc_current_role_key(), ''));
  v_allowed boolean := false;
begin
  if v_role in ('admin', 'administrator', 'super_admin') then
    return true;
  end if;

  if v_role = '' then
    return false;
  end if;

  if to_regclass('public.role_permissions') is not null then
    select exists (
      select 1
      from public.role_permissions rp
      where lower(rp.role_key) = v_role
        and rp.resource in ('communication_centre', 'communicationCentre', 'communication-centre')
        and (
          rp.action = p_action
          or rp.action = 'manage'
          or (p_action in ('view', 'list', 'get') and rp.action in ('view', 'list', 'get'))
        )
        and coalesce(rp.is_allowed, false) = true
        and coalesce(rp.is_active, true) = true
    )
    into v_allowed;
  end if;

  return coalesce(v_allowed, false);
end;
$$;

grant execute on function public.cc_current_app_user_id() to authenticated;
grant execute on function public.cc_current_role_key() to authenticated;
grant execute on function public.cc_is_admin() to authenticated;
grant execute on function public.cc_has_permission(text) to authenticated;

notify pgrst, 'reload schema';

-- Verification: run while logged in through the app/RPC context is best, but this confirms function exists.
select 'communication centre rpc permission helper fixed' as result;
