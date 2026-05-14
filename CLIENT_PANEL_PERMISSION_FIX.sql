-- CLIENT PANEL PERMISSION / RLS FIX
-- Purpose:
--   Allow the clients table to follow the Role Permissions matrix instead of being limited
--   to hard-coded admin/dev style access. Roles that have clients:list/get/update/manage
--   in public.role_permissions will be allowed by RLS.
--
-- Safe to run more than once.

create or replace function public.incheck_current_role_key()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := lower(nullif(auth.jwt()->'app_metadata'->>'role_key', ''));
  if v_role is not null then return v_role; end if;

  v_role := lower(nullif(auth.jwt()->'user_metadata'->>'role_key', ''));
  if v_role is not null then return v_role; end if;

  select lower(nullif(to_jsonb(p)->>'role_key', ''))
    into v_role
  from public.profiles p
  where to_jsonb(p)->>'id' = auth.uid()::text
     or to_jsonb(p)->>'auth_user_id' = auth.uid()::text
     or to_jsonb(p)->>'user_id' = auth.uid()::text
  limit 1;

  return coalesce(v_role, '');
end;
$$;

grant execute on function public.incheck_current_role_key() to authenticated;

create or replace function public.incheck_can_clients_action(p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.incheck_current_role_key();
  v_action text := lower(trim(coalesce(p_action, '')));
begin
  if auth.uid() is null or v_role = '' or v_action = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.role_permissions rp
    where lower(coalesce(rp.role_key, '')) = v_role
      and lower(coalesce(rp.resource, '')) = 'clients'
      and lower(coalesce(rp.action, '')) in (v_action, 'manage')
      and coalesce(rp.is_active, true) = true
      and coalesce(rp.is_allowed, true) = true
  );
end;
$$;

grant execute on function public.incheck_can_clients_action(text) to authenticated;

alter table if exists public.clients enable row level security;

drop policy if exists clients_select_by_role_permissions on public.clients;
create policy clients_select_by_role_permissions
on public.clients
for select
to authenticated
using (
  public.incheck_can_clients_action('list')
  or public.incheck_can_clients_action('get')
  or public.incheck_can_clients_action('view')
  or public.incheck_can_clients_action('manage')
);

drop policy if exists clients_insert_by_role_permissions on public.clients;
create policy clients_insert_by_role_permissions
on public.clients
for insert
to authenticated
with check (
  public.incheck_can_clients_action('create')
  or public.incheck_can_clients_action('manage')
);

drop policy if exists clients_update_by_role_permissions on public.clients;
create policy clients_update_by_role_permissions
on public.clients
for update
to authenticated
using (
  public.incheck_can_clients_action('update')
  or public.incheck_can_clients_action('manage')
)
with check (
  public.incheck_can_clients_action('update')
  or public.incheck_can_clients_action('manage')
);

drop policy if exists clients_delete_by_role_permissions on public.clients;
create policy clients_delete_by_role_permissions
on public.clients
for delete
to authenticated
using (
  public.incheck_can_clients_action('delete')
  or public.incheck_can_clients_action('manage')
);
