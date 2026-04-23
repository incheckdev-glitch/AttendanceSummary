-- Workflow rules: support multi-role approvals end-to-end while preserving legacy approval_role.

alter table public.workflow_rules
  add column if not exists approval_roles text[] default '{}'::text[];

update public.workflow_rules
set approval_roles =
  case
    when coalesce(array_length(approval_roles, 1), 0) > 0 then (
      select coalesce(array_agg(lower(trim(role_value))), '{}'::text[])
      from unnest(approval_roles) as role_value
      where coalesce(trim(role_value), '') <> ''
    )
    when coalesce(trim(approval_role), '') <> '' then array[lower(trim(approval_role))]::text[]
    else '{}'::text[]
  end;

alter table public.workflow_rules
  alter column approval_roles set default '{}'::text[];

-- Ensure legacy scalar approval_role is also normalized for mixed deployments.
update public.workflow_rules
set approval_role = nullif(lower(trim(approval_role)), '')
where approval_role is not null;

-- RPC integration: return approval_roles array with legacy fallback.
create or replace function public.validate_workflow_transition(
  p_resource text,
  p_current_status text,
  p_next_status text,
  p_discount_percent numeric default 0,
  p_record_id text default null,
  p_record jsonb default '{}'::jsonb,
  p_requested_changes jsonb default '{}'::jsonb
)
returns table (
  allowed boolean,
  pending_approval boolean,
  reason text,
  approval_roles text[],
  requested_discount_percent numeric,
  user_discount_limit numeric,
  hard_stop_discount_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.workflow_rules%rowtype;
  v_allowed_roles text[];
  v_approval_roles text[];
  v_current_app_role text;
begin
  v_current_app_role := lower(coalesce(public.current_app_role(), ''));

  select wr.*
  into v_rule
  from public.workflow_rules wr
  where wr.is_active = true
    and lower(coalesce(wr.resource, '')) = lower(coalesce(p_resource, ''))
    and (
      coalesce(trim(wr.current_status), '') = ''
      or lower(wr.current_status) = lower(coalesce(p_current_status, ''))
    )
    and (
      coalesce(trim(wr.next_status), '') = ''
      or lower(wr.next_status) = lower(coalesce(p_next_status, ''))
    )
  order by wr.updated_at desc nulls last, wr.created_at desc nulls last
  limit 1;

  if not found then
    return query
    select true, false, ''::text, '{}'::text[], p_discount_percent, null::numeric, null::numeric;
    return;
  end if;

  v_allowed_roles := coalesce(v_rule.allowed_roles, '{}'::text[]);
  v_approval_roles := coalesce(
    nullif(v_rule.approval_roles, '{}'::text[]),
    case when coalesce(trim(v_rule.approval_role), '') <> '' then array[lower(trim(v_rule.approval_role))]::text[] else '{}'::text[] end
  );

  if coalesce(array_length(v_allowed_roles, 1), 0) > 0
     and not exists (
       select 1
       from unnest(v_allowed_roles) as allowed_role
       where lower(trim(allowed_role)) = v_current_app_role
     ) then
    return query
    select false, false, 'Current role is not allowed for this transition.'::text, v_approval_roles, p_discount_percent, v_rule.max_discount_percent, v_rule.hard_stop_discount_percent;
    return;
  end if;

  if coalesce(v_rule.hard_stop_discount_percent, 0) > 0
     and coalesce(p_discount_percent, 0) > coalesce(v_rule.hard_stop_discount_percent, 0) then
    return query
    select false, false,
      format('Requested discount %s%% exceeds hard stop limit %s%%.', coalesce(p_discount_percent, 0), coalesce(v_rule.hard_stop_discount_percent, 0))::text,
      v_approval_roles,
      p_discount_percent,
      v_rule.max_discount_percent,
      v_rule.hard_stop_discount_percent;
    return;
  end if;

  if coalesce(v_rule.requires_approval, false)
     or (
       coalesce(v_rule.max_discount_percent, 0) > 0
       and coalesce(p_discount_percent, 0) > coalesce(v_rule.max_discount_percent, 0)
     ) then
    return query
    select false, true,
      case
        when coalesce(array_length(v_approval_roles, 1), 0) > 0
          then format('Approval from %s is required before this transition.', array_to_string(v_approval_roles, ', '))
        else 'Approval is required before this transition.'
      end::text,
      v_approval_roles,
      p_discount_percent,
      v_rule.max_discount_percent,
      v_rule.hard_stop_discount_percent;
    return;
  end if;

  return query
  select true, false, ''::text, v_approval_roles, p_discount_percent, v_rule.max_discount_percent, v_rule.hard_stop_discount_percent;
end;
$$;

create or replace function public.validate_workflow_transition(
  p_resource text,
  p_current_status text,
  p_next_status text,
  p_discount_percent numeric default 0
)
returns table (
  allowed boolean,
  pending_approval boolean,
  reason text,
  approval_roles text[],
  requested_discount_percent numeric,
  user_discount_limit numeric,
  hard_stop_discount_percent numeric
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.validate_workflow_transition(
    p_resource,
    p_current_status,
    p_next_status,
    p_discount_percent,
    null,
    '{}'::jsonb,
    '{}'::jsonb
  );
$$;

-- Workflow approvals role matching: user qualifies if role is a member of approval_roles.
-- Keep admin/dev access unchanged.
do $$
declare
  policy_name text;
begin
  for policy_name in
    select pol.polname
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname = 'workflow_approvals'
  loop
    execute format(
      'alter policy %I on public.workflow_approvals using ((lower(coalesce(public.current_app_role(), '''')) in (''admin'', ''dev'')) or exists (select 1 from unnest(coalesce(approval_roles, case when coalesce(trim(approval_role), '''') <> '''' then array[lower(trim(approval_role))]::text[] else ''{}''::text[] end)) as role_key where lower(trim(role_key)) = lower(coalesce(public.current_app_role(), '''')))) with check ((lower(coalesce(public.current_app_role(), '''')) in (''admin'', ''dev'')) or exists (select 1 from unnest(coalesce(approval_roles, case when coalesce(trim(approval_role), '''') <> '''' then array[lower(trim(approval_role))]::text[] else ''{}''::text[] end)) as role_key where lower(trim(role_key)) = lower(coalesce(public.current_app_role(), ''''))))',
      policy_name
    );
  end loop;
end $$;
