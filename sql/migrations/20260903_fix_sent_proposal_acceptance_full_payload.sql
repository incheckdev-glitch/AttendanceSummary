-- Keep Sent proposals commercially locked while allowing the normal form
-- to transition them to Accepted with the two required signature dates.
-- The frontend currently submits a full proposal payload on save, so a
-- final BEFORE UPDATE sanitizer restores every locked field to OLD values.

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
begin
  if current_setting('app.admin_proposal_override', true) = 'on' then
    return new;
  end if;

  if lower(coalesce(old.status::text, '')) = 'sent'
     and lower(coalesce(new.status::text, '')) = 'accepted'
  then
    if new.customer_sign_date is null or new.provider_sign_date is null then
      raise exception 'To accept a Sent proposal, both customer_sign_date and provider_sign_date are required. Use status accepted; signed is not a proposal status.'
        using errcode = '23514',
              constraint = 'proposals_accepted_requires_both_sign_dates_check';
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

create or replace function public.sanitize_sent_proposal_acceptance()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_customer_sign_date public.proposals.customer_sign_date%type;
  v_provider_sign_date public.proposals.provider_sign_date%type;
  v_updated_at public.proposals.updated_at%type;
  v_updated_by public.proposals.updated_by%type;
begin
  if lower(coalesce(old.status::text, '')) = 'sent'
     and lower(coalesce(new.status::text, '')) = 'accepted'
  then
    v_customer_sign_date := new.customer_sign_date;
    v_provider_sign_date := new.provider_sign_date;
    v_updated_at := new.updated_at;
    v_updated_by := new.updated_by;

    if v_customer_sign_date is null or v_provider_sign_date is null then
      raise exception 'To accept a Sent proposal, both customer_sign_date and provider_sign_date are required.'
        using errcode = '23514',
              constraint = 'proposals_accepted_requires_both_sign_dates_check';
    end if;

    new := old;
    new.status := 'accepted';
    new.customer_sign_date := v_customer_sign_date;
    new.provider_sign_date := v_provider_sign_date;
    new.updated_at := coalesce(v_updated_at, old.updated_at, clock_timestamp());
    new.updated_by := coalesce(v_updated_by, old.updated_by);
  end if;

  return new;
end;
$function$;

drop trigger if exists zzzz_sanitize_sent_proposal_acceptance on public.proposals;
create trigger zzzz_sanitize_sent_proposal_acceptance
before update on public.proposals
for each row execute function public.sanitize_sent_proposal_acceptance();
