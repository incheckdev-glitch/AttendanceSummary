-- Extend public e-proposal acceptance to support typed, uploaded, drawn, and signed-document signing.

alter table public.proposals add column if not exists e_signature_type text;
alter table public.proposals add column if not exists e_signature_text text;
alter table public.proposals add column if not exists e_signature_image_data_url text;
alter table public.proposals add column if not exists e_signed_document_data_url text;
alter table public.proposals add column if not exists e_signed_document_file_name text;
alter table public.proposals add column if not exists e_signed_document_mime_type text;
alter table public.proposals add column if not exists e_signature_signed_at timestamptz;
alter table public.proposals add column if not exists e_signature_customer_name text;
alter table public.proposals add column if not exists e_signature_customer_email text;
alter table public.proposals add column if not exists e_signature_confirmed boolean default false;

drop function if exists public.eproposal_accept(text, text, text, text, text);
drop function if exists public.eproposal_accept(text, text, text, text, text, text, text);
drop function if exists public.eproposal_accept(text, text, text, text, text, text, text, text);
drop function if exists public.eproposal_accept(text, text, text, text, text, text, text, text, text, text, text);

create or replace function public.eproposal_accept(
  p_token text,
  p_customer_name text,
  p_customer_email text,
  p_customer_comment text default null,
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

  if v_signature_type not in ('typed', 'uploaded', 'drawn', 'signed_document_upload') then
    raise exception 'Unsupported signature type.';
  end if;
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
  set accepted_at = now(),
      accepted_by_name = btrim(p_customer_name),
      accepted_by_email = btrim(p_customer_email),
      e_proposal_accepted_comment = nullif(btrim(coalesce(p_customer_comment, '')), ''),
      e_signature_type = v_signature_type,
      e_signature_text = v_signature_text,
      e_signature_image_data_url = case when v_signature_type in ('uploaded', 'drawn') then v_signature_image_data_url else null end,
      e_signed_document_data_url = case when v_signature_type = 'signed_document_upload' then v_signed_document_data_url else null end,
      e_signed_document_file_name = case when v_signature_type = 'signed_document_upload' then v_signed_document_file_name else null end,
      e_signed_document_mime_type = case when v_signature_type = 'signed_document_upload' then v_signed_document_mime_type else null end,
      e_signature_signed_at = now(),
      e_signature_customer_name = btrim(p_customer_name),
      e_signature_customer_email = btrim(p_customer_email),
      e_signature_confirmed = true,
      customer_sign_date = coalesce(customer_sign_date, current_date),
      customer_signed_at = coalesce(customer_signed_at, current_date),
      provider_sign_date = coalesce(provider_sign_date, current_date),
      e_proposal_link_enabled = false,
      status = 'accepted',
      updated_at = now()
  where id = v_proposal.id;

  perform public.log_e_proposal_activity(v_proposal.id, 'accepted', p_token, p_customer_name, p_customer_email, jsonb_build_object('comment', p_customer_comment, 'user_agent', p_user_agent, 'signature_type', v_signature_type));
  return jsonb_build_object('ok', true, 'accepted', true, 'proposal_id', v_proposal.id, 'status', 'accepted');
end;
$$;

grant execute on function public.eproposal_accept(text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.accept_e_proposal(p_token text, p_customer_name text, p_customer_email text, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.eproposal_accept(p_token, p_customer_name, p_customer_email, p_comment, null, 'typed', p_customer_name);
end;
$$;
