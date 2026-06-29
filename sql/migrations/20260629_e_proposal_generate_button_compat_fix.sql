-- Fix Generate E-Proposal Link button RPC compatibility.
-- This creates BOTH naming styles used by the frontend:
--   eproposal_generate_link / eproposal_disable_link / eproposal_public_view / eproposal_accept / eproposal_reject
--   generate_e_proposal_link / disable_e_proposal_link / get_e_proposal_by_token / accept_e_proposal / reject_e_proposal

begin;

create extension if not exists pgcrypto;

alter table public.proposals
add column if not exists e_proposal_token text,
add column if not exists e_proposal_token_expires_at timestamptz,
add column if not exists e_proposal_link_enabled boolean default false,
add column if not exists e_proposal_generated_at timestamptz,
add column if not exists e_proposal_generated_by uuid,
add column if not exists viewed_at timestamptz,
add column if not exists accepted_at timestamptz,
add column if not exists accepted_by_name text,
add column if not exists accepted_by_email text,
add column if not exists e_proposal_accepted_comment text,
add column if not exists rejected_at timestamptz,
add column if not exists rejection_reason text;

create unique index if not exists proposals_e_proposal_token_uidx
on public.proposals(e_proposal_token)
where e_proposal_token is not null;

create table if not exists public.proposal_guest_activity_logs (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.proposals(id) on delete cascade,
  event_type text not null,
  token text,
  customer_name text,
  customer_email text,
  ip_address text,
  user_agent text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.proposal_guest_activity_logs enable row level security;

drop policy if exists "Authenticated users can read proposal guest logs" on public.proposal_guest_activity_logs;
create policy "Authenticated users can read proposal guest logs"
on public.proposal_guest_activity_logs
for select
to authenticated
using (true);

create or replace function public.eproposal_safe_date(p_value text)
returns date
language plpgsql
stable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return p_value::date;
exception when others then
  return null;
end;
$$;

create or replace function public.eproposal_safe_numeric(p_value text)
returns numeric
language plpgsql
stable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return p_value::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.log_e_proposal_activity(
  p_proposal_id uuid,
  p_event_type text,
  p_token text default null,
  p_customer_name text default null,
  p_customer_email text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.proposal_guest_activity_logs(
    proposal_id,
    event_type,
    token,
    customer_name,
    customer_email,
    metadata
  ) values (
    p_proposal_id,
    p_event_type,
    p_token,
    nullif(btrim(coalesce(p_customer_name, '')), ''),
    nullif(btrim(coalesce(p_customer_email, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.eproposal_generate_link(
  p_proposal_id uuid,
  p_base_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals%rowtype;
  v_json jsonb;
  v_items_count integer := 0;
  v_token text;
  v_base_url text;
  v_url text;
  v_status text;
  v_valid_until date;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Login is required to generate an e-proposal link.';
  end if;

  select * into v_proposal
  from public.proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'Proposal was not found.';
  end if;

  v_json := to_jsonb(v_proposal);
  v_status := lower(coalesce(v_json->>'status', ''));

  if v_status in ('accepted', 'signed', 'converted', 'converted_to_agreement') then
    raise exception 'Accepted or converted proposals cannot generate a new e-proposal link.';
  end if;

  if v_status in ('rejected', 'declined', 'lost') then
    raise exception 'Rejected proposals cannot generate an e-proposal link unless reopened by ERP first.';
  end if;

  if lower(coalesce(v_json->>'discount_approval_status', '')) in ('pending', 'pending_approval', 'requested', 'approval_required') then
    raise exception 'Discount approval must be completed before generating an e-proposal link.';
  end if;

  if coalesce(
    nullif(v_json->>'company_id', ''),
    nullif(v_json->>'customer_name', ''),
    nullif(v_json->>'company_name', '')
  ) is null then
    raise exception 'Company is required before generating an e-proposal link.';
  end if;

  if coalesce(
    nullif(v_json->>'contact_id', ''),
    nullif(v_json->>'customer_contact_id', ''),
    nullif(v_json->>'customer_contact_name', ''),
    nullif(v_json->>'contact_name', ''),
    nullif(v_json->>'customer_contact_email', ''),
    nullif(v_json->>'contact_email', '')
  ) is null then
    raise exception 'Customer contact is required before generating an e-proposal link.';
  end if;

  select count(*) into v_items_count
  from public.proposal_items
  where proposal_id = p_proposal_id;

  if coalesce(v_items_count, 0) < 1 then
    raise exception 'At least one proposal item is required before generating an e-proposal link.';
  end if;

  if coalesce(
    public.eproposal_safe_numeric(v_json->>'grand_total'),
    public.eproposal_safe_numeric(v_json->>'total_amount'),
    public.eproposal_safe_numeric(v_json->>'proposal_total'),
    0
  ) <= 0 then
    raise exception 'Grand total must be greater than zero before generating an e-proposal link.';
  end if;

  v_valid_until := coalesce(
    public.eproposal_safe_date(v_json->>'valid_until'),
    public.eproposal_safe_date(v_json->>'proposal_valid_until')
  );

  if v_valid_until is null then
    raise exception 'Valid until date is required before generating an e-proposal link.';
  end if;

  v_token := encode(gen_random_bytes(32), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');
  v_expires_at := (v_valid_until + interval '1 day' - interval '1 second')::timestamptz;
  v_base_url := regexp_replace(coalesce(nullif(btrim(p_base_url), ''), 'https://incheck360.com'), '/+$', '');
  v_url := v_base_url || '/e-proposal/' || v_token;

  update public.proposals
  set
    e_proposal_token = v_token,
    e_proposal_token_expires_at = v_expires_at,
    e_proposal_link_enabled = true,
    e_proposal_generated_at = now(),
    e_proposal_generated_by = auth.uid(),
    viewed_at = null,
    status = case when lower(coalesce(status, '')) = 'draft' then 'sent' else status end,
    updated_at = now()
  where id = p_proposal_id
  returning * into v_proposal;

  perform public.log_e_proposal_activity(
    p_proposal_id,
    'link_generated',
    v_token,
    null,
    null,
    jsonb_build_object('generated_by', auth.uid(), 'url', v_url, 'expires_at', v_expires_at)
  );

  return jsonb_build_object(
    'ok', true,
    'proposal_id', p_proposal_id,
    'proposal_number', coalesce(v_json->>'proposal_id', v_json->>'proposal_number', v_json->>'ref_number'),
    'customer_name', coalesce(v_json->>'customer_name', v_json->>'company_name', v_json->>'customer_legal_name'),
    'valid_until', v_valid_until,
    'expires_at', v_expires_at,
    'token', v_token,
    'url', v_url,
    'enabled', true
  );
end;
$$;

create or replace function public.generate_e_proposal_link(
  p_proposal_id uuid,
  p_regenerate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.eproposal_generate_link(p_proposal_id, null);
end;
$$;

create or replace function public.eproposal_disable_link(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals%rowtype;
  v_json jsonb;
begin
  if auth.uid() is null then
    raise exception 'Login is required to disable an e-proposal link.';
  end if;

  update public.proposals
  set e_proposal_link_enabled = false,
      updated_at = now()
  where id = p_proposal_id
  returning * into v_proposal;

  if not found then
    raise exception 'Proposal was not found.';
  end if;

  v_json := to_jsonb(v_proposal);

  perform public.log_e_proposal_activity(p_proposal_id, 'link_disabled', v_proposal.e_proposal_token, null, null, jsonb_build_object('disabled_by', auth.uid()));

  return jsonb_build_object(
    'ok', true,
    'proposal_id', p_proposal_id,
    'proposal_number', coalesce(v_json->>'proposal_id', v_json->>'proposal_number', v_json->>'ref_number'),
    'customer_name', coalesce(v_json->>'customer_name', v_json->>'company_name', v_json->>'customer_legal_name'),
    'valid_until', coalesce(v_json->>'valid_until', v_json->>'proposal_valid_until'),
    'enabled', false
  );
end;
$$;

create or replace function public.disable_e_proposal_link(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.eproposal_disable_link(p_proposal_id);
end;
$$;

create or replace function public.eproposal_public_view(
  p_token text,
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
    and e_proposal_link_enabled is true
    and coalesce(e_proposal_token_expires_at, now() - interval '1 second') > now();

  if not found then
    return jsonb_build_object('ok', false, 'available', false, 'error', 'This proposal link is no longer available.');
  end if;

  if lower(coalesce(v_proposal.status, '')) in ('accepted', 'rejected', 'declined', 'lost') then
    return jsonb_build_object('ok', false, 'available', false, 'error', 'This proposal link is no longer available.');
  end if;

  update public.proposals
  set viewed_at = coalesce(viewed_at, now())
  where id = v_proposal.id;

  perform public.log_e_proposal_activity(v_proposal.id, 'proposal_viewed', p_token, null, null, jsonb_build_object('user_agent', p_user_agent));

  select coalesce(jsonb_agg(to_jsonb(pi)), '[]'::jsonb)
  into v_items
  from public.proposal_items pi
  where pi.proposal_id = v_proposal.id;

  return jsonb_build_object(
    'ok', true,
    'available', true,
    'proposal', to_jsonb(v_proposal) - 'e_proposal_token' - 'e_proposal_generated_by',
    'items', v_items
  );
end;
$$;

create or replace function public.get_e_proposal_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.eproposal_public_view(p_token, null);
end;
$$;

create or replace function public.eproposal_accept(
  p_token text,
  p_customer_name text,
  p_customer_email text,
  p_customer_comment text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals%rowtype;
begin
  if nullif(btrim(coalesce(p_customer_name, '')), '') is null then
    raise exception 'Full name is required to accept this proposal.';
  end if;

  if nullif(btrim(coalesce(p_customer_email, '')), '') is null then
    raise exception 'Email is required to accept this proposal.';
  end if;

  select * into v_proposal
  from public.proposals
  where e_proposal_token = p_token
    and e_proposal_link_enabled is true
    and coalesce(e_proposal_token_expires_at, now() - interval '1 second') > now()
  for update;

  if not found then
    raise exception 'This proposal link is no longer available.';
  end if;

  if lower(coalesce(v_proposal.status, '')) in ('accepted', 'signed', 'converted', 'converted_to_agreement') then
    raise exception 'This proposal has already been accepted.';
  end if;

  if lower(coalesce(v_proposal.status, '')) in ('rejected', 'declined', 'lost') then
    raise exception 'Rejected proposals cannot be accepted from this link.';
  end if;

  update public.proposals
  set status = 'accepted',
      accepted_at = now(),
      accepted_by_name = btrim(p_customer_name),
      accepted_by_email = btrim(p_customer_email),
      e_proposal_accepted_comment = nullif(btrim(coalesce(p_customer_comment, '')), ''),
      e_proposal_link_enabled = false,
      updated_at = now()
  where id = v_proposal.id;

  perform public.log_e_proposal_activity(v_proposal.id, 'accepted', p_token, p_customer_name, p_customer_email, jsonb_build_object('comment', p_customer_comment, 'user_agent', p_user_agent));

  return jsonb_build_object('ok', true, 'accepted', true, 'proposal_id', v_proposal.id, 'status', 'accepted');
end;
$$;

create or replace function public.accept_e_proposal(
  p_token text,
  p_customer_name text,
  p_customer_email text,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.eproposal_accept(p_token, p_customer_name, p_customer_email, p_comment, null);
end;
$$;

create or replace function public.eproposal_reject(
  p_token text,
  p_customer_name text default null,
  p_customer_email text default null,
  p_rejection_reason text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals%rowtype;
begin
  select * into v_proposal
  from public.proposals
  where e_proposal_token = p_token
    and e_proposal_link_enabled is true
    and coalesce(e_proposal_token_expires_at, now() - interval '1 second') > now()
  for update;

  if not found then
    raise exception 'This proposal link is no longer available.';
  end if;

  if lower(coalesce(v_proposal.status, '')) in ('accepted', 'signed', 'converted', 'converted_to_agreement') then
    raise exception 'Accepted proposals cannot be rejected.';
  end if;

  update public.proposals
  set status = 'rejected',
      rejected_at = now(),
      rejection_reason = nullif(btrim(coalesce(p_rejection_reason, '')), ''),
      e_proposal_link_enabled = false,
      updated_at = now()
  where id = v_proposal.id;

  perform public.log_e_proposal_activity(v_proposal.id, 'rejected', p_token, p_customer_name, p_customer_email, jsonb_build_object('reason', p_rejection_reason, 'user_agent', p_user_agent));

  return jsonb_build_object('ok', true, 'rejected', true, 'proposal_id', v_proposal.id, 'status', 'rejected');
end;
$$;

create or replace function public.reject_e_proposal(
  p_token text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.eproposal_reject(p_token, null, null, p_rejection_reason, null);
end;
$$;

revoke all on function public.eproposal_generate_link(uuid, text) from public;
revoke all on function public.generate_e_proposal_link(uuid, boolean) from public;
revoke all on function public.eproposal_disable_link(uuid) from public;
revoke all on function public.disable_e_proposal_link(uuid) from public;
revoke all on function public.eproposal_public_view(text, text) from public;
revoke all on function public.get_e_proposal_by_token(text) from public;
revoke all on function public.eproposal_accept(text, text, text, text, text) from public;
revoke all on function public.accept_e_proposal(text, text, text, text) from public;
revoke all on function public.eproposal_reject(text, text, text, text, text) from public;
revoke all on function public.reject_e_proposal(text, text) from public;
revoke all on function public.log_e_proposal_activity(uuid, text, text, text, text, jsonb) from public;

grant execute on function public.eproposal_generate_link(uuid, text) to authenticated;
grant execute on function public.generate_e_proposal_link(uuid, boolean) to authenticated;
grant execute on function public.eproposal_disable_link(uuid) to authenticated;
grant execute on function public.disable_e_proposal_link(uuid) to authenticated;

grant execute on function public.eproposal_public_view(text, text) to anon, authenticated;
grant execute on function public.get_e_proposal_by_token(text) to anon, authenticated;
grant execute on function public.eproposal_accept(text, text, text, text, text) to anon, authenticated;
grant execute on function public.accept_e_proposal(text, text, text, text) to anon, authenticated;
grant execute on function public.eproposal_reject(text, text, text, text, text) to anon, authenticated;
grant execute on function public.reject_e_proposal(text, text) to anon, authenticated;
grant execute on function public.log_e_proposal_activity(uuid, text, text, text, text, jsonb) to anon, authenticated;

commit;
