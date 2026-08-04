-- Atomic, Admin-only override for historically expired proposals.
alter table public.proposals
  add column if not exists accepted_by uuid,
  add column if not exists accepted_after_expiry boolean not null default false;

create table if not exists public.proposal_expiry_acceptance_audit (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete restrict,
  proposal_number text not null,
  previous_status text not null check (previous_status = 'expired'),
  new_status text not null check (new_status = 'accepted'),
  admin_user_id uuid not null,
  admin_name text not null,
  overridden_at timestamptz not null default clock_timestamp(),
  original_validity_date date,
  reason text
);

alter table public.proposal_expiry_acceptance_audit enable row level security;
revoke all on public.proposal_expiry_acceptance_audit from anon, authenticated;

create or replace function public.preserve_terminal_proposal_status()
returns trigger language plpgsql as $$
begin
  -- No trigger, import, scheduled job, or ordinary update may expire a terminal proposal.
  if old.status in ('accepted', 'rejected', 'converted', 'converted_to_agreement')
     and new.status = 'expired' then
    new.status := old.status;
  elsif new.status not in ('accepted', 'rejected', 'converted', 'converted_to_agreement')
        and coalesce(new.valid_until, new.proposal_valid_until) < current_date then
    new.status := 'expired';
  end if;
  return new;
end;
$$;

drop trigger if exists proposals_preserve_terminal_status on public.proposals;
create trigger proposals_preserve_terminal_status
before insert or update of status, valid_until, proposal_valid_until on public.proposals
for each row execute function public.preserve_terminal_proposal_status();

create or replace function public.admin_accept_expired_proposal(
  p_proposal_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal public.proposals%rowtype;
  v_profile public.profiles%rowtype;
  v_role text;
  v_name text;
  v_now timestamptz := clock_timestamp();
  v_agreement jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid() limit 1;
  v_role := lower(coalesce(to_jsonb(v_profile)->>'role_key', to_jsonb(v_profile)->>'role', ''));
  if v_role <> 'admin' then
    raise exception using errcode = '42501', message = 'Only an Admin can accept an expired proposal.';
  end if;

  select * into v_proposal from public.proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'The proposal no longer exists.'; end if;
  if lower(coalesce(v_proposal.status, '')) = 'accepted' then
    raise exception using errcode = 'P0001', message = 'This proposal has already been accepted.';
  end if;
  if lower(coalesce(v_proposal.status, '')) in ('rejected', 'converted', 'converted_to_agreement')
     or coalesce(v_proposal.valid_until, v_proposal.proposal_valid_until) >= current_date then
    raise exception using errcode = 'P0001', message = 'Only an expired proposal can use this Admin override.';
  end if;

  v_name := coalesce(to_jsonb(v_profile)->>'full_name', to_jsonb(v_profile)->>'name', to_jsonb(v_profile)->>'email', 'Admin');
  update public.proposals set
    status = 'accepted', accepted_at = v_now, accepted_by = auth.uid(),
    accepted_by_name = v_name, accepted_after_expiry = true, updated_at = v_now
  where id = p_proposal_id returning * into v_proposal;

  insert into public.proposal_expiry_acceptance_audit
    (proposal_id, proposal_number, previous_status, new_status, admin_user_id, admin_name, overridden_at, original_validity_date, reason)
  values
    (v_proposal.id, coalesce(v_proposal.proposal_id, v_proposal.ref_number, v_proposal.id::text),
     'expired', 'accepted', auth.uid(), v_name, v_now,
     coalesce(v_proposal.valid_until, v_proposal.proposal_valid_until), nullif(btrim(p_reason), ''));

  -- Agreement creation is not part of the normal acceptance path in this application.
  -- Still resolve an existing conversion under the same row lock so callers never create a duplicate.
  select to_jsonb(a) into v_agreement from public.agreements a
   where a.proposal_id = p_proposal_id order by a.created_at asc limit 1;

  return jsonb_build_object('proposal', to_jsonb(v_proposal), 'agreement', v_agreement,
    'agreement_already_exists', v_agreement is not null);
end;
$$;

revoke all on function public.admin_accept_expired_proposal(uuid, text) from public, anon;
grant execute on function public.admin_accept_expired_proposal(uuid, text) to authenticated;

