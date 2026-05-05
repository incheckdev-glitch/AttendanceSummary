-- =========================================================
-- Communication Centre access fix
-- Only roles with communication_centre:manage = true can see/use it.
-- Delete remains separate and is not granted by manage.
-- Edit the allowed role list in section 2 if needed.
-- =========================================================

-- 1. Remove duplicate/old alias resources.
delete from public.role_permissions
where resource in (
  'communicationCentre',
  'communication-centre',
  'communication_center',
  'communications',
  'journal',
  'journal_communication'
);

-- 2. Ensure every role has canonical manage/delete rows.
do $$
begin
  if to_regclass('public.roles') is null then
    raise exception 'public.roles table not found';
  end if;

  with existing_roles as (
    select lower(role_key) as role_key
    from public.roles
    where role_key is not null
  ),
  seed(role_key, action, is_allowed) as (
    select
      role_key,
      'manage',
      case
        -- EDIT THIS LIST if another role should access Communication Centre.
        when role_key in ('admin', 'dev', 'csm', 'hoo') then true
        else false
      end
    from existing_roles

    union all

    select
      role_key,
      'delete',
      false
    from existing_roles
  ),
  updated as (
    update public.role_permissions rp
    set
      is_allowed = seed.is_allowed,
      is_active = true
    from seed
    where lower(rp.role_key) = lower(seed.role_key)
      and rp.resource = 'communication_centre'
      and rp.action = seed.action
    returning rp.role_key, rp.action
  )
  insert into public.role_permissions (
    role_key,
    resource,
    action,
    is_allowed,
    is_active
  )
  select
    seed.role_key,
    'communication_centre',
    seed.action,
    seed.is_allowed,
    true
  from seed
  where not exists (
    select 1
    from public.role_permissions rp
    where lower(rp.role_key) = lower(seed.role_key)
      and rp.resource = 'communication_centre'
      and rp.action = seed.action
  );
end $$;

-- 3. Remove duplicate canonical rows.
with ranked as (
  select
    ctid,
    role_key,
    resource,
    action,
    row_number() over (
      partition by lower(role_key), resource, action
      order by
        coalesce(is_allowed, false) desc,
        coalesce(is_active, true) desc,
        ctid desc
    ) as rn
  from public.role_permissions
  where resource = 'communication_centre'
)
delete from public.role_permissions rp
using ranked r
where rp.ctid = r.ctid
  and r.rn > 1;

-- 4. Backend helper: manage controls normal access; delete is separate only.
create or replace function public.cc_has_permission(p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.cc_current_role_key();
  v_allowed boolean := false;
begin
  if v_role is null or v_role in ('authenticated', 'anon', 'service_role') then
    return false;
  end if;

  if lower(p_action) = 'delete' then
    select exists (
      select 1
      from public.role_permissions rp
      where lower(rp.role_key) = lower(v_role)
        and rp.resource = 'communication_centre'
        and rp.action = 'delete'
        and coalesce(rp.is_allowed, false) = true
        and coalesce(rp.is_active, true) = true
    )
    into v_allowed;

    return coalesce(v_allowed, false);
  end if;

  select exists (
    select 1
    from public.role_permissions rp
    where lower(rp.role_key) = lower(v_role)
      and rp.resource = 'communication_centre'
      and rp.action = 'manage'
      and coalesce(rp.is_allowed, false) = true
      and coalesce(rp.is_active, true) = true
  )
  into v_allowed;

  return coalesce(v_allowed, false);
end;
$$;

grant execute on function public.cc_has_permission(text) to authenticated;

notify pgrst, 'reload schema';

-- 5. Verify access.
select
  role_key,
  resource,
  action,
  is_allowed,
  is_active
from public.role_permissions
where resource = 'communication_centre'
order by role_key, action;

-- 6. Verify no duplicates.
select
  lower(role_key) as role_key,
  resource,
  action,
  count(*) as duplicate_count
from public.role_permissions
where resource ilike '%communication%'
group by lower(role_key), resource, action
having count(*) > 1
order by role_key, resource, action;
