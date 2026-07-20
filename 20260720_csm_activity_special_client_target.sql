-- CSM Daily Activity: allow activities to target standalone Special CS Clients.
-- Run once in Supabase SQL Editor before deploying the updated frontend files.

begin;

alter table if exists public.csm_activities
  add column if not exists special_client_id uuid,
  add column if not exists special_client_name text;

do $$
declare
  c record;
begin
  if to_regclass('public.csm_activities') is null then
    raise exception 'Table public.csm_activities does not exist.';
  end if;

  -- Replace older checks that allowed only signed/manual/group activity scopes.
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.csm_activities'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%activity_context%'
  loop
    execute format(
      'alter table public.csm_activities drop constraint if exists %I',
      c.conname
    );
  end loop;

  alter table public.csm_activities
    add constraint csm_activities_activity_context_scope_chk
    check (
      activity_context is null
      or activity_context in (
        'agreement_client',
        'manual_client',
        'cs_group',
        'special_client'
      )
    );

  -- Add the FK only when the Special CS Client table is installed.
  if to_regclass('public.cs_special_clients') is not null
     and not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.csm_activities'::regclass
         and conname = 'csm_activities_special_client_id_fkey'
     ) then
    alter table public.csm_activities
      add constraint csm_activities_special_client_id_fkey
      foreign key (special_client_id)
      references public.cs_special_clients(id)
      on delete set null;
  end if;
end
$$;

create index if not exists csm_activities_special_client_idx
  on public.csm_activities(special_client_id, created_at desc)
  where activity_context = 'special_client';

-- Keep a readable snapshot even if a Special CS Client is later archived.
update public.csm_activities a
set special_client_name = coalesce(nullif(btrim(a.special_client_name), ''), s.client_name),
    client = coalesce(nullif(btrim(a.client), ''), s.client_name),
    client_name = coalesce(nullif(btrim(a.client_name), ''), s.client_name),
    company_name = coalesce(nullif(btrim(a.company_name), ''), s.client_name)
from public.cs_special_clients s
where a.activity_context = 'special_client'
  and a.special_client_id = s.id;

commit;
