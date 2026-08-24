-- Ensure lead -> deal conversion satisfies the mandatory deal follow-up trigger.
-- The deal inherits the qualified lead's current next_follow_up_at during conversion.

create or replace function public.convert_lead_to_deal(p_lead_uuid uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing_deal_uuid uuid;
  v_new_deal_uuid uuid;
  v_deal_code text;
  v_next_follow_up_at timestamptz;
begin
  if not (public.app_is_admin() or public.app_is_dev()) then
    raise exception 'Only admin or dev can convert lead to deal';
  end if;

  select converted_to_deal_id, next_follow_up_at
    into v_existing_deal_uuid, v_next_follow_up_at
  from public.leads
  where id = p_lead_uuid;

  if not found then
    raise exception 'Lead not found';
  end if;

  if v_existing_deal_uuid is not null then
    return v_existing_deal_uuid;
  end if;

  if v_next_follow_up_at is null then
    raise exception 'Next follow-up is required before converting this lead to deal.';
  end if;

  v_deal_code := 'DEAL-' || lpad(floor(random() * 1000000)::text, 6, '0');

  while exists (
    select 1
    from public.deals
    where deal_id = v_deal_code
  ) loop
    v_deal_code := 'DEAL-' || lpad(floor(random() * 1000000)::text, 6, '0');
  end loop;

  insert into public.deals (
    deal_id,
    lead_id,
    lead_code,
    full_name,
    company_id,
    company_name,
    customer_name,
    customer_legal_name,
    customer_address,
    contact_id,
    contact_name,
    contact_email,
    contact_phone,
    phone,
    email,
    country,
    lead_source,
    service_interest,
    proposal_needed,
    agreement_needed,
    stage,
    status,
    assigned_to,
    notes,
    priority,
    estimated_value,
    currency,
    next_follow_up_at,
    converted_at,
    created_by,
    updated_by
  )
  select
    v_deal_code,
    l.id,
    l.lead_id,
    l.full_name,
    l.company_id,
    l.company_name,
    l.customer_name,
    l.customer_legal_name,
    l.customer_address,
    l.contact_id,
    l.contact_name,
    l.contact_email,
    l.contact_phone,
    l.phone,
    l.email,
    l.country,
    l.lead_source,
    l.service_interest,
    l.proposal_needed,
    l.agreement_needed,
    'new',
    coalesce(nullif(l.status, ''), 'open'),
    l.assigned_to,
    l.notes,
    l.priority,
    l.estimated_value,
    l.currency,
    l.next_follow_up_at,
    now(),
    auth.uid(),
    auth.uid()
  from public.leads l
  where l.id = p_lead_uuid
  returning id into v_new_deal_uuid;

  update public.leads
  set
    converted_to_deal_id = v_new_deal_uuid,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_lead_uuid;

  return v_new_deal_uuid;
end;
$function$;
