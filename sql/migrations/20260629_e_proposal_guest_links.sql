-- Secure public e-proposal links for proposal guest review/accept/reject.
create extension if not exists pgcrypto;

alter table proposals
add column if not exists e_proposal_token text,
add column if not exists e_proposal_token_expires_at timestamptz,
add column if not exists e_proposal_link_enabled boolean default false,
add column if not exists e_proposal_generated_at timestamptz,
add column if not exists e_proposal_generated_by uuid,
add column if not exists viewed_at timestamptz,
add column if not exists accepted_at timestamptz,
add column if not exists accepted_by_name text,
add column if not exists accepted_by_email text,
add column if not exists rejected_at timestamptz,
add column if not exists rejection_reason text;

create unique index if not exists proposals_e_proposal_token_uidx
  on proposals(e_proposal_token)
  where e_proposal_token is not null;

create table if not exists proposal_guest_activity_logs (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id) on delete cascade,
  event_type text not null,
  token text,
  customer_name text,
  customer_email text,
  ip_address text,
  user_agent text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table proposal_guest_activity_logs enable row level security;

create or replace function public.log_e_proposal_activity(
  p_proposal_id uuid,
  p_event_type text,
  p_token text default null,
  p_customer_name text default null,
  p_customer_email text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_type not in ('link_generated','link_copied','link_opened','proposal_viewed','accepted','rejected','link_regenerated','link_disabled') then
    raise exception 'Unsupported e-proposal event type: %', p_event_type;
  end if;
  insert into proposal_guest_activity_logs(proposal_id,event_type,token,customer_name,customer_email,metadata)
  values (p_proposal_id,p_event_type,p_token,p_customer_name,p_customer_email,coalesce(p_metadata,'{}'::jsonb));
end;
$$;

create or replace function public.generate_e_proposal_link(p_proposal_id uuid, p_regenerate boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal proposals%rowtype;
  v_item_count integer;
  v_token text;
  v_event text := 'link_generated';
begin
  if auth.uid() is null then raise exception 'Login is required to generate an e-proposal link.'; end if;
  select * into v_proposal from proposals where id = p_proposal_id for update;
  if not found then raise exception 'Proposal was not found.'; end if;
  if nullif(v_proposal.company_id::text,'') is null and nullif(v_proposal.customer_name,'') is null then raise exception 'Company is required before generating an e-proposal link.'; end if;
  if coalesce(v_proposal.contact_id::text, v_proposal.customer_contact_name, v_proposal.contact_name, v_proposal.customer_contact_email, v_proposal.contact_email, '') = '' then raise exception 'Customer contact is required before generating an e-proposal link.'; end if;
  select count(*) into v_item_count from proposal_items where proposal_id = v_proposal.id;
  if v_item_count < 1 then raise exception 'At least one proposal item is required before generating an e-proposal link.'; end if;
  if coalesce(v_proposal.grand_total,0) <= 0 then raise exception 'Grand total must be greater than zero before generating an e-proposal link.'; end if;
  if lower(coalesce(v_proposal.status,'')) = 'accepted' then raise exception 'Accepted proposals cannot generate a new e-proposal link.'; end if;
  if lower(coalesce(v_proposal.status,'')) in ('rejected','declined','lost') then raise exception 'Rejected proposals cannot generate an e-proposal link unless reopened by ERP first.'; end if;
  if coalesce(v_proposal.discount_approval_status,'') in ('pending','pending_approval','requested') then raise exception 'Discount approval must be completed before generating an e-proposal link.'; end if;
  if coalesce(v_proposal.valid_until, v_proposal.proposal_valid_until) is null then raise exception 'Valid until date is required before generating an e-proposal link.'; end if;

  if p_regenerate or v_proposal.e_proposal_token is null then
    v_token := encode(gen_random_bytes(32), 'base64');
    v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');
    if p_regenerate and v_proposal.e_proposal_token is not null then v_event := 'link_regenerated'; end if;
  else
    v_token := v_proposal.e_proposal_token;
  end if;

  update proposals
  set e_proposal_token = v_token,
      e_proposal_token_expires_at = (coalesce(v_proposal.valid_until, v_proposal.proposal_valid_until)::date + interval '1 day'),
      e_proposal_link_enabled = true,
      e_proposal_generated_at = now(),
      e_proposal_generated_by = auth.uid(),
      status = case when lower(coalesce(status,'')) = 'draft' then 'sent' else status end,
      updated_at = now()
  where id = v_proposal.id
  returning * into v_proposal;

  perform public.log_e_proposal_activity(v_proposal.id, v_event, v_token, null, null, jsonb_build_object('generated_by', auth.uid()));

  return jsonb_build_object('proposal_id', v_proposal.id, 'proposal_number', coalesce(v_proposal.proposal_id, v_proposal.ref_number), 'customer_name', v_proposal.customer_name, 'valid_until', coalesce(v_proposal.valid_until, v_proposal.proposal_valid_until), 'token', v_token, 'enabled', v_proposal.e_proposal_link_enabled);
end;
$$;

create or replace function public.disable_e_proposal_link(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_proposal proposals%rowtype;
begin
  if auth.uid() is null then raise exception 'Login is required to disable an e-proposal link.'; end if;
  update proposals set e_proposal_link_enabled = false, updated_at = now() where id = p_proposal_id returning * into v_proposal;
  if not found then raise exception 'Proposal was not found.'; end if;
  perform public.log_e_proposal_activity(v_proposal.id, 'link_disabled', v_proposal.e_proposal_token);
  return jsonb_build_object('proposal_id', v_proposal.id, 'proposal_number', coalesce(v_proposal.proposal_id, v_proposal.ref_number), 'customer_name', v_proposal.customer_name, 'valid_until', coalesce(v_proposal.valid_until, v_proposal.proposal_valid_until), 'token', v_proposal.e_proposal_token, 'enabled', false);
end;
$$;

create or replace function public.get_e_proposal_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_proposal proposals%rowtype; v_items jsonb;
begin
  select * into v_proposal from proposals where e_proposal_token = p_token and e_proposal_link_enabled is true and coalesce(e_proposal_token_expires_at, now() + interval '1 minute') > now();
  if not found then return jsonb_build_object('available', false); end if;
  if lower(coalesce(v_proposal.status,'')) in ('accepted','rejected','declined','lost') then return jsonb_build_object('available', false); end if;
  update proposals set viewed_at = coalesce(viewed_at, now()) where id = v_proposal.id;
  perform public.log_e_proposal_activity(v_proposal.id, 'link_opened', p_token);
  perform public.log_e_proposal_activity(v_proposal.id, 'proposal_viewed', p_token);
  select coalesce(jsonb_agg(to_jsonb(pi) order by pi.line_no nulls last, pi.created_at nulls last), '[]'::jsonb) into v_items from proposal_items pi where pi.proposal_id = v_proposal.id;
  return jsonb_build_object('available', true, 'proposal', to_jsonb(v_proposal) - 'e_proposal_token', 'items', v_items);
end;
$$;

create or replace function public.accept_e_proposal(p_token text, p_customer_name text, p_customer_email text, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_proposal proposals%rowtype;
begin
  if nullif(trim(coalesce(p_customer_name,'')), '') is null then raise exception 'Full name is required to accept this proposal.'; end if;
  if nullif(trim(coalesce(p_customer_email,'')), '') is null then raise exception 'Email is required to accept this proposal.'; end if;
  select * into v_proposal from proposals where e_proposal_token = p_token and e_proposal_link_enabled is true and coalesce(e_proposal_token_expires_at, now() + interval '1 minute') > now() for update;
  if not found then raise exception 'This proposal link is no longer available.'; end if;
  if lower(coalesce(v_proposal.status,'')) = 'accepted' then raise exception 'This proposal has already been accepted.'; end if;
  if lower(coalesce(v_proposal.status,'')) in ('rejected','declined','lost') then raise exception 'Rejected proposals cannot be accepted from this link.'; end if;
  update proposals set status='accepted', accepted_at=now(), accepted_by_name=trim(p_customer_name), accepted_by_email=trim(p_customer_email), e_proposal_link_enabled=false, updated_at=now() where id=v_proposal.id returning * into v_proposal;
  perform public.log_e_proposal_activity(v_proposal.id, 'accepted', p_token, p_customer_name, p_customer_email, jsonb_build_object('comment', p_comment));
  return jsonb_build_object('accepted', true, 'proposal_id', v_proposal.id);
end;
$$;

create or replace function public.reject_e_proposal(p_token text, p_rejection_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_proposal proposals%rowtype;
begin
  select * into v_proposal from proposals where e_proposal_token = p_token and e_proposal_link_enabled is true and coalesce(e_proposal_token_expires_at, now() + interval '1 minute') > now() for update;
  if not found then raise exception 'This proposal link is no longer available.'; end if;
  if lower(coalesce(v_proposal.status,'')) = 'accepted' then raise exception 'Accepted proposals cannot be rejected.'; end if;
  update proposals set status='rejected', rejected_at=now(), rejection_reason=nullif(trim(coalesce(p_rejection_reason,'')),''), e_proposal_link_enabled=false, updated_at=now() where id=v_proposal.id returning * into v_proposal;
  perform public.log_e_proposal_activity(v_proposal.id, 'rejected', p_token, null, null, jsonb_build_object('reason', p_rejection_reason));
  return jsonb_build_object('rejected', true, 'proposal_id', v_proposal.id);
end;
$$;

grant execute on function public.generate_e_proposal_link(uuid, boolean) to authenticated;
grant execute on function public.disable_e_proposal_link(uuid) to authenticated;
grant execute on function public.log_e_proposal_activity(uuid, text, text, text, text, jsonb) to authenticated, anon;
grant execute on function public.get_e_proposal_by_token(text) to anon, authenticated;
grant execute on function public.accept_e_proposal(text, text, text, text) to anon, authenticated;
grant execute on function public.reject_e_proposal(text, text) to anon, authenticated;
