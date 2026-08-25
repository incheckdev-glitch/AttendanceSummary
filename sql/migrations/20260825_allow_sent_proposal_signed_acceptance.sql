create or replace function public.enforce_accepted_proposal_lock()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_allowed_fields text[] := array[
    'signed_document_path',
    'signed_document_name',
    'signed_document_uploaded_at',
    'signed_document_uploaded_by',
    'updated_at',
    'updated_by'
  ];
  v_acceptance_fields text[] := array[
    'status',
    'customer_sign_date',
    'provider_sign_date',
    'updated_at',
    'updated_by'
  ];
begin
  if current_setting('app.admin_proposal_override', true) = 'on' then
    return new;
  end if;

  -- Sent proposals stay locked for commercial edits, but the designated
  -- signature transition is allowed when both required sign dates exist.
  if lower(coalesce(old.status::text, '')) = 'sent'
     and lower(coalesce(new.status::text, '')) = 'accepted'
  then
    if new.customer_sign_date is null or new.provider_sign_date is null then
      raise exception 'To accept a Sent proposal, both customer_sign_date and provider_sign_date are required. Use status accepted; signed is not a proposal status.'
        using errcode = '23514',
              constraint = 'proposals_accepted_requires_both_sign_dates_check';
    end if;

    if (to_jsonb(new) - v_acceptance_fields) is distinct from (to_jsonb(old) - v_acceptance_fields) then
      raise exception 'Sent proposal acceptance may only change status and signature dates.';
    end if;

    return new;
  end if;

  if lower(coalesce(old.status::text, '')) in (
      'accepted', 'expired', 'sent', 'rejected', 'converted', 'converted_to_agreement'
    )
    and (to_jsonb(new) - v_allowed_fields) is distinct from (to_jsonb(old) - v_allowed_fields)
  then
    raise exception 'This proposal is locked.';
  end if;

  return new;
end;
$function$;
