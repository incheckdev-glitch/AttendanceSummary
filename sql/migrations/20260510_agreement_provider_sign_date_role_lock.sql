-- InCheck360 Agreement Provider Signature Date Role Lock
--
-- Provider Official Signatory 1 Sign Date can only be filled/changed by
-- Senior Financial Controller role aliases.
-- Provider Official Signatory 2 Sign Date can only be filled/changed by
-- General Manager role aliases.
--
-- Supported role_key aliases:
--   Signatory 1: senior_financial_controller, financial_controller, senior_fc, sfc
--   Signatory 2: general_manager, gm
-- Edit the IN (...) lists below if your exact role_key names are different.

alter table if exists public.agreements
  alter column provider_official_signatory_1_sign_date drop default;

alter table if exists public.agreements
  alter column provider_official_signatory_2_sign_date drop default;

alter table if exists public.agreements
  alter column provider_sign_date drop default;

create or replace function public.enforce_agreement_provider_sign_date_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_key text := '';
  v_actor_id uuid := auth.uid();
  v_sfc_roles constant text[] := array[
    'senior_financial_controller',
    'financial_controller',
    'senior_fc',
    'sfc'
  ];
  v_gm_roles constant text[] := array[
    'general_manager',
    'gm'
  ];
begin
  if v_actor_id is not null then
    select lower(regexp_replace(coalesce(p.role_key, ''), '[^a-zA-Z0-9]+', '_', 'g'))
      into v_role_key
    from public.profiles p
    where p.id = v_actor_id
    limit 1;

    v_role_key := trim(both '_' from coalesce(v_role_key, ''));
  end if;

  if tg_op = 'INSERT' then
    if new.provider_official_signatory_1_sign_date is not null
       and not (v_role_key = any(v_sfc_roles)) then
      raise exception 'Provider Official Signatory 1 Sign Date can only be filled by the Senior Financial Controller role.' using errcode = '42501';
    end if;

    if new.provider_official_signatory_2_sign_date is not null
       and not (v_role_key = any(v_gm_roles)) then
      raise exception 'Provider Official Signatory 2 Sign Date can only be filled by the General Manager role.' using errcode = '42501';
    end if;
  else
    if new.provider_official_signatory_1_sign_date is distinct from old.provider_official_signatory_1_sign_date
       and not (v_role_key = any(v_sfc_roles)) then
      raise exception 'Provider Official Signatory 1 Sign Date can only be changed by the Senior Financial Controller role.' using errcode = '42501';
    end if;

    if new.provider_official_signatory_2_sign_date is distinct from old.provider_official_signatory_2_sign_date
       and not (v_role_key = any(v_gm_roles)) then
      raise exception 'Provider Official Signatory 2 Sign Date can only be changed by the General Manager role.' using errcode = '42501';
    end if;
  end if;

  -- Keep legacy/summary flags aligned with the two official provider sign dates.
  new.financial_controller_signed := (new.provider_official_signatory_1_sign_date is not null);
  new.gm_signed := (new.provider_official_signatory_2_sign_date is not null);

  -- Keep the legacy single provider_sign_date mapped only to provider signatory 1.
  -- It must never be copied into signatory 2.
  new.provider_sign_date := new.provider_official_signatory_1_sign_date;

  return new;
end;
$$;

drop trigger if exists trg_enforce_agreement_provider_sign_date_roles on public.agreements;

create trigger trg_enforce_agreement_provider_sign_date_roles
before insert or update of
  provider_official_signatory_1_sign_date,
  provider_official_signatory_2_sign_date,
  provider_sign_date,
  financial_controller_signed,
  gm_signed
on public.agreements
for each row
execute function public.enforce_agreement_provider_sign_date_roles();

-- Optional verification query: check your exact role keys.
-- select id, email, name, role_key from public.profiles where role_key in ('senior_financial_controller','financial_controller','general_manager','gm');
