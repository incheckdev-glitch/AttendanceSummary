-- Client Success 360 role access update
-- Full access: admin, csm, gm/general_manager, sfc/senior_financial_controller
-- View-only access: viewer
-- Applies to CS-owned tables only. Does not add payment/accounting access.

create or replace function public.cs360_current_role_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(
    regexp_replace(
      coalesce(
        (select p.role from public.profiles p where p.id = auth.uid()),
        ''
      ),
      '[\s-]+',
      '_',
      'g'
    )
  );
$$;

create or replace function public.cs360_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_current_role_key() in (
    'admin',
    'csm',
    'gm',
    'general_manager',
    'sfc',
    'senior_financial_controller'
  );
$$;

create or replace function public.cs360_can_view()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_can_manage()
    or public.cs360_current_role_key() in ('viewer');
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'cs_client_profiles',
    'cs_client_reviews',
    'cs_client_review_answers',
    'cs_tasks',
    'cs_risks',
    'cs_qbrs',
    'cs_client_contacts',
    'cs_review_templates',
    'cs_review_template_questions',
    'cs_location_completions',
    'cs_client_groups',
    'cs_client_group_members',
    'cs_client_brands',
    'cs_client_brand_locations'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);

      execute format('drop policy if exists %I on public.%I', t || '_cs360_select', t);
      execute format('drop policy if exists %I on public.%I', t || '_cs360_insert', t);
      execute format('drop policy if exists %I on public.%I', t || '_cs360_update', t);
      execute format('drop policy if exists %I on public.%I', t || '_cs360_delete', t);

      execute format(
        'create policy %I on public.%I for select using (public.cs360_can_view())',
        t || '_cs360_select',
        t
      );

      execute format(
        'create policy %I on public.%I for insert with check (public.cs360_can_manage())',
        t || '_cs360_insert',
        t
      );

      execute format(
        'create policy %I on public.%I for update using (public.cs360_can_manage()) with check (public.cs360_can_manage())',
        t || '_cs360_update',
        t
      );

      execute format(
        'create policy %I on public.%I for delete using (public.cs360_can_manage())',
        t || '_cs360_delete',
        t
      );
    end if;
  end loop;
end $$;

-- Verification helper
select
  public.cs360_current_role_key() as current_role_key,
  public.cs360_can_view() as can_view_customer_success,
  public.cs360_can_manage() as can_manage_customer_success;
