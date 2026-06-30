-- Capture customer IP address and user agent in public e-proposal audit logs.

alter table public.proposal_guest_activity_logs
add column if not exists ip_address text,
add column if not exists user_agent text;

drop policy if exists "Authenticated users can read proposal guest logs" on public.proposal_guest_activity_logs;
drop policy if exists "Authorized ERP users can read proposal guest logs" on public.proposal_guest_activity_logs;
create policy "Authorized ERP users can read proposal guest logs"
on public.proposal_guest_activity_logs
for select
to authenticated
using (
  lower(coalesce(public.current_app_role(), '')) in (
    'admin',
    'gm',
    'general_manager',
    'sfc',
    'senior_fc',
    'senior_financial_controller',
    'financial_controller',
    'audit',
    'auditor',
    'proposal_audit'
  )
);

create or replace function public.log_e_proposal_activity(
  p_proposal_id uuid,
  p_event_type text,
  p_token text default null,
  p_customer_name text default null,
  p_customer_email text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_ip_address text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.proposal_guest_activity_logs(
    proposal_id, event_type, token, customer_name, customer_email, ip_address, user_agent, metadata
  ) values (
    p_proposal_id,
    p_event_type,
    p_token,
    nullif(btrim(coalesce(p_customer_name, '')), ''),
    nullif(btrim(coalesce(p_customer_email, '')), ''),
    nullif(btrim(coalesce(p_ip_address, '')), ''),
    nullif(btrim(coalesce(p_user_agent, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

drop function if exists public.eproposal_public_view(text, text);
create or replace function public.eproposal_public_view(
  p_token text,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals%rowtype;
  v_items jsonb;
begin
  select * into v_proposal
  from public.proposals
  where e_proposal_token = p_token
    and ((e_proposal_link_enabled is true and coalesce(e_proposal_token_expires_at, now() - interval '1 second') > now())
      or lower(coalesce(status, '')) in ('accepted', 'signed', 'converted', 'converted_to_agreement'));

  if not found or lower(coalesce(v_proposal.status, '')) in ('rejected', 'declined', 'lost') then
    return jsonb_build_object('ok', false, 'available', false, 'error', 'This proposal link is no longer available.');
  end if;

  update public.proposals set viewed_at = coalesce(viewed_at, now()) where id = v_proposal.id;
  perform public.log_e_proposal_activity(v_proposal.id, 'proposal_viewed', p_token, null, null, '{}'::jsonb, p_ip_address, p_user_agent);

  select coalesce(jsonb_agg(to_jsonb(pi) - array['internal_notes','internal_note','internal_cost','cost','cost_price','margin','created_by','updated_by','audit_log']::text[]), '[]'::jsonb)
  into v_items
  from public.proposal_items pi
  where pi.proposal_id = v_proposal.id;

  return jsonb_build_object(
    'ok', true, 'available', true,
    'proposal', to_jsonb(v_proposal) - array['e_proposal_token','e_proposal_generated_by','internal_notes','internal_note','internal_cost','approval_logs','audit_log','created_by','updated_by']::text[],
    'items', v_items
  );
end;
$$;

create or replace function public.get_e_proposal_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.eproposal_public_view(p_token, null, null);
end;
$$;

drop function if exists public.eproposal_accept(text, text, text, text, text, text, text, text, text, text, text);
create or replace function public.eproposal_accept(
  p_token text,
  p_customer_name text,
  p_customer_email text,
  p_customer_comment text default null,
  p_ip_address text default null,
  p_user_agent text default null,
  p_signature_type text default 'typed',
  p_signature_text text default null,
  p_signature_image_data_url text default null,
  p_signed_document_data_url text default null,
  p_signed_document_file_name text default null,
  p_signed_document_mime_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals%rowtype;
  v_signature_type text := lower(btrim(coalesce(p_signature_type, 'typed')));
  v_signature_text text := nullif(btrim(coalesce(p_signature_text, '')), '');
  v_signature_image_data_url text := nullif(btrim(coalesce(p_signature_image_data_url, '')), '');
  v_signed_document_data_url text := nullif(btrim(coalesce(p_signed_document_data_url, '')), '');
  v_signed_document_file_name text := nullif(btrim(coalesce(p_signed_document_file_name, '')), '');
  v_signed_document_mime_type text := lower(btrim(coalesce(p_signed_document_mime_type, '')));
begin
  if nullif(btrim(coalesce(p_customer_name, '')), '') is null then raise exception 'Full name is required to accept this proposal.'; end if;
  if nullif(btrim(coalesce(p_customer_email, '')), '') is null then raise exception 'Email is required to accept this proposal.'; end if;
  if v_signature_type not in ('typed', 'uploaded', 'drawn', 'signed_document_upload') then raise exception 'Unsupported signature type.'; end if;
  if v_signature_type = 'typed' and v_signature_text is null then raise exception 'Typed signature is required.'; end if;
  if v_signature_type in ('uploaded', 'drawn') and v_signature_image_data_url is null then raise exception 'Signature image is required.'; end if;
  if v_signature_type in ('uploaded', 'drawn') and v_signature_image_data_url !~* '^data:image/(png|jpe?g|webp);base64,' then raise exception 'Signature image must be a PNG, JPG, JPEG, or WEBP data URL.'; end if;
  if v_signature_type = 'signed_document_upload' and (v_signed_document_data_url is null or v_signed_document_file_name is null or v_signed_document_mime_type = '') then raise exception 'Signed proposal file, file name, and MIME type are required.'; end if;
  if v_signature_type = 'signed_document_upload' and v_signed_document_mime_type not in ('application/pdf','image/png','image/jpeg','image/jpg','image/webp') then raise exception 'Signed proposal must be a PDF, PNG, JPG, JPEG, or WEBP file.'; end if;

  select * into v_proposal from public.proposals where e_proposal_token = p_token and e_proposal_link_enabled is true and coalesce(e_proposal_token_expires_at, now() - interval '1 second') > now() for update;
  if not found then raise exception 'This proposal link is no longer available.'; end if;
  if lower(coalesce(v_proposal.status, '')) in ('accepted', 'signed', 'converted', 'converted_to_agreement') then raise exception 'This proposal has already been accepted.'; end if;
  if lower(coalesce(v_proposal.status, '')) in ('rejected', 'declined', 'lost') then raise exception 'Rejected proposals cannot be accepted from this link.'; end if;

  update public.proposals
  set accepted_at = now(), accepted_by_name = btrim(p_customer_name), accepted_by_email = btrim(p_customer_email),
      e_proposal_accepted_comment = nullif(btrim(coalesce(p_customer_comment, '')), ''), e_signature_type = v_signature_type,
      e_signature_text = v_signature_text, e_signature_image_data_url = case when v_signature_type in ('uploaded', 'drawn') then v_signature_image_data_url else null end,
      e_signed_document_data_url = case when v_signature_type = 'signed_document_upload' then v_signed_document_data_url else null end,
      e_signed_document_file_name = case when v_signature_type = 'signed_document_upload' then v_signed_document_file_name else null end,
      e_signed_document_mime_type = case when v_signature_type = 'signed_document_upload' then v_signed_document_mime_type else null end,
      e_signature_signed_at = now(), e_signature_customer_name = btrim(p_customer_name), e_signature_customer_email = btrim(p_customer_email), e_signature_confirmed = true,
      customer_sign_date = coalesce(customer_sign_date, current_date), customer_signed_at = coalesce(customer_signed_at, current_date), provider_sign_date = coalesce(provider_sign_date, current_date),
      e_proposal_link_enabled = false, status = 'accepted', updated_at = now()
  where id = v_proposal.id;

  perform public.log_e_proposal_activity(v_proposal.id, 'accepted', p_token, p_customer_name, p_customer_email, jsonb_build_object('comment', p_customer_comment, 'signature_type', v_signature_type), p_ip_address, p_user_agent);
  if v_signature_type = 'signed_document_upload' then
    perform public.log_e_proposal_activity(v_proposal.id, 'signed_document_uploaded', p_token, p_customer_name, p_customer_email, jsonb_build_object('file_name', v_signed_document_file_name, 'mime_type', v_signed_document_mime_type, 'signature_type', v_signature_type), p_ip_address, p_user_agent);
  end if;
  return jsonb_build_object('ok', true, 'accepted', true, 'proposal_id', v_proposal.id, 'status', 'accepted');
end;
$$;

create or replace function public.accept_e_proposal(p_token text, p_customer_name text, p_customer_email text, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.eproposal_accept(p_token, p_customer_name, p_customer_email, p_comment, null, null, 'typed', p_customer_name);
end;
$$;

drop function if exists public.eproposal_reject(text, text, text, text, text);
create or replace function public.eproposal_reject(
  p_token text,
  p_customer_name text default null,
  p_customer_email text default null,
  p_rejection_reason text default null,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_proposal public.proposals%rowtype;
begin
  select * into v_proposal from public.proposals where e_proposal_token = p_token and e_proposal_link_enabled is true and coalesce(e_proposal_token_expires_at, now() - interval '1 second') > now() for update;
  if not found then raise exception 'This proposal link is no longer available.'; end if;
  if lower(coalesce(v_proposal.status, '')) in ('accepted', 'signed', 'converted', 'converted_to_agreement') then raise exception 'Accepted proposals cannot be rejected.'; end if;
  update public.proposals set status = 'rejected', rejected_at = now(), rejection_reason = nullif(btrim(coalesce(p_rejection_reason, '')), ''), e_proposal_link_enabled = false, updated_at = now() where id = v_proposal.id;
  perform public.log_e_proposal_activity(v_proposal.id, 'rejected', p_token, p_customer_name, p_customer_email, jsonb_build_object('reason', p_rejection_reason), p_ip_address, p_user_agent);
  return jsonb_build_object('ok', true, 'rejected', true, 'proposal_id', v_proposal.id, 'status', 'rejected');
end;
$$;

create or replace function public.reject_e_proposal(p_token text, p_rejection_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.eproposal_reject(p_token, null, null, p_rejection_reason, null, null);
end;
$$;

grant execute on function public.eproposal_public_view(text, text, text) to anon, authenticated;
grant execute on function public.eproposal_accept(text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.eproposal_reject(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.log_e_proposal_activity(uuid, text, text, text, text, jsonb, text, text) to anon, authenticated;
