-- Fix accepted proposal locking so the public acceptance/signing update is allowed.
-- The lock must only apply after a proposal was already accepted before the update.

alter table public.proposals add column if not exists e_signature_ip_address text;

-- Remove older accepted-proposal lock triggers/functions that raised the lock error based
-- only on NEW.status. They prevent the one public accept transaction from saving status
-- and signature fields together.
do $$
declare
  v_trigger record;
  v_function record;
begin
  for v_trigger in
    select tg.tgname
    from pg_trigger tg
    join pg_class cls on cls.oid = tg.tgrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join pg_proc proc on proc.oid = tg.tgfoid
    join pg_namespace proc_ns on proc_ns.oid = proc.pronamespace
    where ns.nspname = 'public'
      and cls.relname = 'proposals'
      and not tg.tgisinternal
      and pg_get_functiondef(proc.oid) ilike '%Accepted proposals are locked and cannot be edited. Only signed document upload is allowed.%'
  loop
    execute format('drop trigger if exists %I on public.proposals', v_trigger.tgname);
  end loop;

  for v_function in
    select proc_ns.nspname as schema_name, proc.proname, proc.oid
    from pg_proc proc
    join pg_namespace proc_ns on proc_ns.oid = proc.pronamespace
    where proc_ns.nspname = 'public'
      and pg_get_functiondef(proc.oid) ilike '%Accepted proposals are locked and cannot be edited. Only signed document upload is allowed.%'
  loop
    execute format('drop function if exists %I.%I() cascade', v_function.schema_name, v_function.proname);
  end loop;
end $$;

create or replace function public.enforce_accepted_proposal_lock()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_allowed_fields text[] := array[
    -- Internal/manual signed document upload fields that may still be maintained after acceptance.
    'e_signed_document_data_url',
    'e_signed_document_file_name',
    'e_signed_document_mime_type',
    -- Standard metadata columns commonly maintained by save/upload flows.
    'updated_at',
    'updated_by'
  ];
begin
  -- This is the important distinction: only lock rows that were already accepted
  -- before this update. The transition from draft/pending/etc. to accepted is the
  -- public signing transaction and must be allowed to save all signature fields in
  -- the same backend update.
  if lower(coalesce(old.status, '')) = 'accepted'
     and (to_jsonb(new) - v_allowed_fields) is distinct from (to_jsonb(old) - v_allowed_fields) then
    raise exception 'Accepted proposals are locked and cannot be edited. Only signed document upload is allowed.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_accepted_proposal_lock on public.proposals;
create trigger trg_enforce_accepted_proposal_lock
before update on public.proposals
for each row
execute function public.enforce_accepted_proposal_lock();

-- Keep Edge Function RPC names available and make the accept path one backend transaction.
-- Named parameters from eproposal-action map directly to this wrapper.
drop function if exists public.eproposal_accept_with_ip(text, text, text, text, text, text, text, text, text, text, text, text);
drop function if exists public.eproposal_public_view_with_ip(text, text, text);
drop function if exists public.eproposal_reject_with_ip(text, text, text, text, text, text);

create or replace function public.eproposal_accept_with_ip(
  p_token text,
  p_customer_name text,
  p_customer_email text,
  p_customer_comment text default null,
  p_user_agent text default null,
  p_ip_address text default null,
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
  v_result jsonb;
  v_proposal_id uuid;
  v_accepted_at timestamptz;
begin
  v_result := public.eproposal_accept(
    p_token,
    p_customer_name,
    p_customer_email,
    p_customer_comment,
    p_ip_address,
    p_user_agent,
    p_signature_type,
    p_signature_text,
    p_signature_image_data_url,
    p_signed_document_data_url,
    p_signed_document_file_name,
    p_signed_document_mime_type
  );

  v_proposal_id := nullif(v_result ->> 'proposal_id', '')::uuid;
  select accepted_at into v_accepted_at from public.proposals where id = v_proposal_id;

  return v_result || jsonb_build_object('accepted_at', v_accepted_at);
end;
$$;

create or replace function public.eproposal_public_view_with_ip(
  p_token text,
  p_user_agent text default null,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.eproposal_public_view(p_token, p_ip_address, p_user_agent);
end;
$$;

create or replace function public.eproposal_reject_with_ip(
  p_token text,
  p_customer_name text default null,
  p_customer_email text default null,
  p_rejection_reason text default null,
  p_user_agent text default null,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.eproposal_reject(p_token, p_customer_name, p_customer_email, p_rejection_reason, p_ip_address, p_user_agent);
end;
$$;

grant execute on function public.eproposal_accept_with_ip(text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.eproposal_public_view_with_ip(text, text, text) to anon, authenticated;
grant execute on function public.eproposal_reject_with_ip(text, text, text, text, text, text) to anon, authenticated;
