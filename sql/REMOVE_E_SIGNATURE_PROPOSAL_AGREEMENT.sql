-- Remove the retired E-Proposal / E-Agreement electronic-signature feature.
-- Keeps the normal Proposal and Agreement modules, manual signature dates,
-- and signed_document_* upload/storage fields.
-- Run once in Supabase SQL Editor as a database owner/admin.

begin;

-- 1) Remove public guest/audit and internal electronic-signature tables.
drop table if exists public.proposal_guest_activity_logs cascade;
drop table if exists public.agreement_guest_activity_logs cascade;
drop table if exists public.agreement_internal_signatures cascade;

-- 2) Remove every RPC/function used only by E-Proposal / E-Agreement.
do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (
        p.proname like 'eproposal\_%' escape '\'
        or p.proname like 'eagreement\_%' escape '\'
        or p.proname in (
          'generate_e_proposal_link',
          'disable_e_proposal_link',
          'get_e_proposal_by_token',
          'accept_e_proposal',
          'reject_e_proposal',
          'log_e_proposal_activity',
          'agreement_internal_sign',
          'normalize_agreement_signer_role',
          'refresh_agreement_signature_status'
        )
      )
  loop
    execute format(
      'drop function if exists %I.%I(%s) cascade',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  end loop;
end $$;

-- 3) Preserve the ordinary (non-electronic) proposal lifecycle fields that the
-- normal Proposal module still uses. Some older E-Proposal migrations originally
-- introduced these columns, so make them explicit before removing that feature.
alter table if exists public.proposals
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by_name text,
  add column if not exists accepted_by_email text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

-- Keep the ordinary/manual customer signed timestamp used by the Agreement module.
alter table if exists public.agreements
  add column if not exists customer_signed_at timestamptz;

-- 4) Remove E-Proposal database columns.
alter table if exists public.proposals
  drop column if exists e_proposal_token,
  drop column if exists e_proposal_token_expires_at,
  drop column if exists e_proposal_link_enabled,
  drop column if exists e_proposal_generated_at,
  drop column if exists e_proposal_generated_by,
  drop column if exists e_proposal_accepted_comment,
  drop column if exists viewed_at,
  drop column if exists e_signature_type,
  drop column if exists e_signature_text,
  drop column if exists e_signature_image_data_url,
  drop column if exists e_signed_document_data_url,
  drop column if exists e_signed_document_file_name,
  drop column if exists e_signed_document_mime_type,
  drop column if exists e_signature_signed_at,
  drop column if exists e_signature_customer_name,
  drop column if exists e_signature_customer_email,
  drop column if exists e_signature_ip_address,
  drop column if exists e_signature_confirmed;

-- 5) Remove E-Agreement public/customer electronic-signature columns.
-- customer_signed_at and the manual *_sign_date fields are retained because the
-- ERP still uses them as ordinary/manual lifecycle dates.
alter table if exists public.agreements
  drop column if exists accepted_at,
  drop column if exists customer_signature_date,
  drop column if exists e_agreement_token,
  drop column if exists e_agreement_token_expires_at,
  drop column if exists e_agreement_link_enabled,
  drop column if exists e_agreement_generated_at,
  drop column if exists e_agreement_generated_by,
  drop column if exists e_agreement_viewed_at,
  drop column if exists e_agreement_accepted_at,
  drop column if exists e_agreement_accepted_by_name,
  drop column if exists e_agreement_accepted_by_email,
  drop column if exists e_agreement_accepted_comment,
  drop column if exists e_agreement_rejected_at,
  drop column if exists e_agreement_rejection_reason,
  drop column if exists e_agreement_signature_type,
  drop column if exists e_agreement_signature_text,
  drop column if exists e_agreement_signature_image_data_url,
  drop column if exists e_agreement_signed_document_data_url,
  drop column if exists e_agreement_signed_document_file_name,
  drop column if exists e_agreement_signed_document_mime_type,
  drop column if exists e_agreement_signature_signed_at,
  drop column if exists e_agreement_signature_customer_name,
  drop column if exists e_agreement_signature_customer_email,
  drop column if exists e_agreement_signature_ip_address,
  drop column if exists e_agreement_signature_confirmed,
  drop column if exists customer_signature_confirmed,
  drop column if exists customer_accepted_at,
  drop column if exists customer_signed_by_name,
  drop column if exists customer_signed_by_email,
  drop column if exists customer_signature_type,
  drop column if exists customer_signature_text,
  drop column if exists customer_signature_image_data_url,
  drop column if exists customer_signed_document_data_url,
  drop column if exists customer_signed_document_file_name,
  drop column if exists customer_signed_document_mime_type,
  drop column if exists customer_signature_ip_address,
  -- Compatibility aliases that may have been copied from proposals by older builds.
  drop column if exists e_signature_type,
  drop column if exists e_signature_text,
  drop column if exists e_signature_image_data_url,
  drop column if exists e_signed_document_data_url,
  drop column if exists e_signed_document_file_name,
  drop column if exists e_signed_document_mime_type,
  drop column if exists e_signature_signed_at,
  drop column if exists e_signature_customer_name,
  drop column if exists e_signature_customer_email,
  drop column if exists e_signature_ip_address,
  drop column if exists e_signature_confirmed;

-- 6) Keep the existing accepted-proposal lock, but allow only the normal manual
-- signed-document upload metadata after a proposal has been locked.
create or replace function public.enforce_accepted_proposal_lock()
returns trigger
language plpgsql
set search_path = public
as $$
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

  if lower(coalesce(old.status::text, '')) in (
      'accepted', 'expired', 'sent', 'rejected', 'converted', 'converted_to_agreement'
    )
    and (to_jsonb(new) - v_allowed_fields) is distinct from (to_jsonb(old) - v_allowed_fields)
  then
    raise exception 'This proposal is locked.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_accepted_proposal_lock on public.proposals;
create trigger trg_enforce_accepted_proposal_lock
before update on public.proposals
for each row
execute function public.enforce_accepted_proposal_lock();

notify pgrst, 'reload schema';

commit;

-- IMPORTANT: SQL cannot undeploy Supabase Edge Functions.
-- Delete these separately after running this SQL:
--   supabase functions delete eproposal-action --project-ref YOUR_PROJECT_REF
--   supabase functions delete eagreement-action --project-ref YOUR_PROJECT_REF
