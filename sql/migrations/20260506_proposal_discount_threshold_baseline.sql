-- Proposal discount approvals use no-approval thresholds, hard stops, and approved baselines.
-- Approval is not tied to a fixed approval range or to status changes alone.

alter table public.proposals
  add column if not exists approved_annual_saas_discount_percent numeric,
  add column if not exists approved_one_time_fee_discount_percent numeric;

alter table public.workflow_rules
  add column if not exists annual_saas_no_approval_until_percent numeric default 10,
  add column if not exists annual_saas_hard_stop_discount_percent numeric default 20,
  add column if not exists one_time_fee_no_approval_until_percent numeric default 20,
  add column if not exists one_time_fee_hard_stop_discount_percent numeric default 30;

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
  v_resource text;
  v_category_discounts jsonb;
  v_annual_discount numeric;
  v_one_time_discount numeric;
  v_annual_no_approval numeric;
  v_annual_hard_stop numeric;
  v_one_time_no_approval numeric;
  v_one_time_hard_stop numeric;
  v_approved_annual numeric;
  v_approved_one_time numeric;
  v_has_approved_annual boolean;
  v_has_approved_one_time boolean;
  v_annual_needs_approval boolean;
  v_one_time_needs_approval boolean;
begin
  v_current_app_role := lower(coalesce(public.current_app_role(), ''));
  v_resource := lower(coalesce(p_resource, ''));

  select wr.*
  into v_rule
  from public.workflow_rules wr
  where wr.is_active = true
    and lower(coalesce(wr.resource, '')) = v_resource
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

  if v_resource = 'proposals' then
    v_category_discounts := coalesce(
      p_requested_changes -> 'category_discounts',
      p_requested_changes -> 'discounts',
      p_record -> 'category_discounts',
      '{}'::jsonb
    );
    v_annual_discount := coalesce(
      nullif(p_requested_changes ->> 'annual_saas_discount_percent', '')::numeric,
      nullif(v_category_discounts ->> 'annualSaasDiscount', '')::numeric,
      nullif(v_category_discounts ->> 'annual_saas_discount_percent', '')::numeric,
      0
    );
    v_one_time_discount := coalesce(
      nullif(p_requested_changes ->> 'one_time_fee_discount_percent', '')::numeric,
      nullif(v_category_discounts ->> 'oneTimeFeeDiscount', '')::numeric,
      nullif(v_category_discounts ->> 'one_time_fee_discount_percent', '')::numeric,
      0
    );
    if v_annual_discount = 0 and v_one_time_discount = 0 then
      v_annual_discount := coalesce(p_discount_percent, 0);
    end if;

    v_annual_no_approval := coalesce(v_rule.annual_saas_no_approval_until_percent, 10);
    v_annual_hard_stop := coalesce(v_rule.annual_saas_hard_stop_discount_percent, 20);
    v_one_time_no_approval := coalesce(v_rule.one_time_fee_no_approval_until_percent, 20);
    v_one_time_hard_stop := coalesce(v_rule.one_time_fee_hard_stop_discount_percent, 30);

    v_has_approved_annual := coalesce(trim(p_record ->> 'approved_annual_saas_discount_percent'), '') <> '';
    v_has_approved_one_time := coalesce(trim(p_record ->> 'approved_one_time_fee_discount_percent'), '') <> '';
    v_approved_annual := case when v_has_approved_annual then (p_record ->> 'approved_annual_saas_discount_percent')::numeric else null end;
    v_approved_one_time := case when v_has_approved_one_time then (p_record ->> 'approved_one_time_fee_discount_percent')::numeric else null end;

    if v_annual_discount > v_annual_hard_stop then
      return query
      select false, false,
        format('Annual SaaS discount above %s%% is not allowed.', v_annual_hard_stop)::text,
        v_approval_roles,
        greatest(v_annual_discount, v_one_time_discount),
        v_annual_no_approval,
        v_annual_hard_stop;
      return;
    end if;

    if v_one_time_discount > v_one_time_hard_stop then
      return query
      select false, false,
        format('One-time fee discount above %s%% is not allowed.', v_one_time_hard_stop)::text,
        v_approval_roles,
        greatest(v_annual_discount, v_one_time_discount),
        v_one_time_no_approval,
        v_one_time_hard_stop;
      return;
    end if;

    v_annual_needs_approval := v_annual_discount > v_annual_no_approval
      and (not v_has_approved_annual or v_annual_discount > v_approved_annual)
      and v_annual_discount <= v_annual_hard_stop;
    v_one_time_needs_approval := v_one_time_discount > v_one_time_no_approval
      and (not v_has_approved_one_time or v_one_time_discount > v_approved_one_time)
      and v_one_time_discount <= v_one_time_hard_stop;

    if v_annual_needs_approval or v_one_time_needs_approval then
      return query
      select false, true,
        concat_ws(' ',
          case when v_annual_needs_approval then format('Annual SaaS discount %s%% requires approval.', v_annual_discount) end,
          case when v_one_time_needs_approval then format('One-time fee discount %s%% requires approval.', v_one_time_discount) end
        )::text,
        v_approval_roles,
        greatest(v_annual_discount, v_one_time_discount),
        greatest(v_annual_no_approval, v_one_time_no_approval),
        greatest(v_annual_hard_stop, v_one_time_hard_stop);
      return;
    end if;

    return query
    select true, false, ''::text, v_approval_roles, greatest(v_annual_discount, v_one_time_discount), greatest(v_annual_no_approval, v_one_time_no_approval), greatest(v_annual_hard_stop, v_one_time_hard_stop);
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
