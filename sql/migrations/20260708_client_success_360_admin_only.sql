-- Client Success 360 — admin-only module
-- Run this once in Supabase SQL editor before using the frontend module.
-- Scope: CS health, weekly/monthly client reviews, tasks, risks, QBRs, contacts.
-- Intentionally excludes invoices, receipts, pending amounts, collections, and payment tables.

create extension if not exists pgcrypto;

create or replace function public.client_success_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.profiles p
       where p.id = auth.uid()
         and lower(trim(coalesce(to_jsonb(p)->>'role_key', to_jsonb(p)->>'role', ''))) = 'admin'
     );
$$;

grant execute on function public.client_success_is_admin() to authenticated;

create table if not exists public.cs_client_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique,
  company_name_snapshot text,
  assigned_csm_user_id uuid,
  assigned_csm_name text,
  assigned_csm_email text,
  client_status text not null default 'Live' check (client_status in ('Onboarding','Live','Watch','At Risk','Suspended','Churned')),
  lifecycle_stage text not null default 'Live',
  manual_sentiment text not null default 'Unknown' check (manual_sentiment in ('Very Satisfied','Satisfied','Neutral','Unsatisfied','Critical','Unknown')),
  adoption_level text not null default 'Unknown' check (adoption_level in ('Excellent','Good','Partial','Low','Unknown')),
  relationship_status text not null default 'Normal' check (relationship_status in ('Strong','Normal','Weak','At Risk')),
  health_score_override integer check (health_score_override is null or (health_score_override between 0 and 100)),
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cs_client_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  location_name text,
  csm_user_id uuid,
  csm_name text,
  csm_email text,
  review_type text not null check (review_type in ('weekly','monthly')),
  review_period_start date not null,
  review_period_end date not null,
  review_date date not null default current_date,
  client_status text not null default 'Live' check (client_status in ('Onboarding','Live','Watch','At Risk','Suspended','Churned')),
  satisfaction_level text not null default 'Unknown' check (satisfaction_level in ('Very Satisfied','Satisfied','Neutral','Unsatisfied','Critical','Unknown')),
  adoption_level text not null default 'Unknown' check (adoption_level in ('Excellent','Good','Partial','Low','Unknown')),
  relationship_status text not null default 'Normal' check (relationship_status in ('Strong','Normal','Weak','At Risk')),
  extra_cs_effort_needed boolean not null default false,
  cs_effort_level text not null default 'Normal Care' check (cs_effort_level in ('Normal Care','Needs Attention','High Touch','Recovery Required')),
  escalation_required boolean not null default false,
  review_completion_percent integer not null default 0 check (review_completion_percent between 0 and 100),
  status text not null default 'Draft' check (status in ('Draft','Completed','Missed','Needs Follow-up','Escalated')),
  summary text,
  next_action text,
  next_follow_up_date date,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs_client_reviews_company_period_idx on public.cs_client_reviews(company_id, review_type, review_period_start, review_period_end);
create index if not exists cs_client_reviews_status_idx on public.cs_client_reviews(status, review_date desc);

create table if not exists public.cs_client_review_answers (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.cs_client_reviews(id) on delete cascade,
  question_key text not null,
  question_label text not null,
  answer_value text not null default 'N/A',
  answer_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(review_id, question_key)
);


create table if not exists public.cs_location_completions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  company_name_snapshot text,
  location_name text not null,
  review_type text not null default 'weekly' check (review_type in ('weekly','monthly')),
  period_start date not null,
  period_end date not null,
  done_on_time numeric(12,2) not null default 0 check (done_on_time >= 0),
  done_late numeric(12,2) not null default 0 check (done_late >= 0),
  partially_done numeric(12,2) not null default 0 check (partially_done >= 0),
  missed numeric(12,2) not null default 0 check (missed >= 0),
  source_note text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, location_name, review_type, period_start, period_end)
);

create index if not exists cs_location_completions_company_period_idx on public.cs_location_completions(company_id, review_type, period_start, period_end);

create table if not exists public.cs_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  location_name text,
  title text not null,
  assigned_to text,
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Urgent')),
  due_date date,
  status text not null default 'To Do' check (status in ('To Do','In Progress','Done','Overdue','Canceled')),
  related_activity_id uuid,
  related_risk_id uuid,
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs_tasks_company_status_idx on public.cs_tasks(company_id, status, due_date);

create table if not exists public.cs_risks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  location_name text,
  risk_type text not null default 'Relationship Risk',
  severity text not null default 'Medium' check (severity in ('Low','Medium','High','Critical')),
  owner text,
  description text not null,
  root_cause text,
  action_plan text,
  due_date date,
  status text not null default 'Open' check (status in ('Open','In Progress','Escalated','Resolved','Lost')),
  escalated_to text,
  resolution_notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs_risks_company_status_idx on public.cs_risks(company_id, status, severity);

create table if not exists public.cs_qbrs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  meeting_date date not null default current_date,
  attendees text,
  topics_discussed text,
  usage_summary text,
  issues text,
  client_feedback text,
  renewal_discussion text,
  opportunities text,
  decisions text,
  action_items text,
  next_qbr_date date,
  status text not null default 'Completed' check (status in ('Planned','Completed','Canceled')),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs_qbrs_company_meeting_idx on public.cs_qbrs(company_id, meeting_date desc);

create table if not exists public.cs_client_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  title text,
  email text,
  phone text,
  role text not null default 'Daily User',
  influence_level text not null default 'Medium' check (influence_level in ('Low','Medium','High')),
  relationship_status text not null default 'Normal' check (relationship_status in ('Strong','Normal','Weak','At Risk')),
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs_client_contacts_company_idx on public.cs_client_contacts(company_id, role);


create table if not exists public.cs_client_groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  group_code text,
  owner_user_id uuid,
  owner_name text,
  owner_email text,
  status text not null default 'Active' check (status in ('Active','Watch','At Risk','Archived')),
  description text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_name)
);

create index if not exists cs_client_groups_status_idx on public.cs_client_groups(status, group_name);

create table if not exists public.cs_client_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cs_client_groups(id) on delete cascade,
  company_id uuid not null,
  group_name_snapshot text,
  company_name_snapshot text,
  member_role text,
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_id, company_id)
);

create index if not exists cs_client_group_members_group_idx on public.cs_client_group_members(group_id);
create index if not exists cs_client_group_members_company_idx on public.cs_client_group_members(company_id);


create table if not exists public.cs_review_templates (
  id uuid primary key default gen_random_uuid(),
  review_type text not null unique check (review_type in ('weekly','monthly')),
  title text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cs_review_template_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.cs_review_templates(id) on delete cascade,
  question_key text not null,
  question_label text not null,
  answer_type text not null default 'select',
  options text[] not null default array['Yes','No','N/A']::text[],
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id, question_key)
);

insert into public.cs_review_templates (review_type, title)
values ('weekly','Weekly Client Pulse Review'), ('monthly','Monthly Client Success Review')
on conflict (review_type) do update set title = excluded.title, is_active = true, updated_at = now();

with weekly as (select id from public.cs_review_templates where review_type = 'weekly'),
questions(question_key, question_label, sort_order) as (
  values
    ('client_contacted','Was the client contacted this week?',10),
    ('client_responded','Did the client respond?',20),
    ('client_satisfied','Is the client satisfied?',30),
    ('system_used_properly','Is the client using the system properly?',40),
    ('unresolved_issues','Are there unresolved issues?',50),
    ('training_needed','Is extra training needed?',60),
    ('relationship_risk','Is there any relationship risk?',70),
    ('extra_effort_needed','Does the client need extra CS effort?',80),
    ('escalation_needed','Should this be escalated?',90)
)
insert into public.cs_review_template_questions (template_id, question_key, question_label, sort_order)
select weekly.id, q.question_key, q.question_label, q.sort_order from weekly cross join questions q
on conflict (template_id, question_key) do update set question_label = excluded.question_label, sort_order = excluded.sort_order, updated_at = now();

with monthly as (select id from public.cs_review_templates where review_type = 'monthly'),
questions(question_key, question_label, sort_order) as (
  values
    ('adoption_reviewed','Was adoption reviewed this month?',10),
    ('relationship_reviewed','Was relationship quality reviewed?',20),
    ('satisfaction_confirmed','Was client satisfaction confirmed?',30),
    ('concerns_logged','Were open concerns checked?',40),
    ('training_reviewed','Were training needs reviewed?',50),
    ('renewal_discussed','Was renewal confidence/status reviewed?',60),
    ('extra_effort_needed','Does the client need extra CS effort?',70),
    ('escalation_needed','Should management be escalated?',80),
    ('next_plan_defined','Is next month action plan defined?',90)
)
insert into public.cs_review_template_questions (template_id, question_key, question_label, sort_order)
select monthly.id, q.question_key, q.question_label, q.sort_order from monthly cross join questions q
on conflict (template_id, question_key) do update set question_label = excluded.question_label, sort_order = excluded.sort_order, updated_at = now();

create or replace function public.set_client_success_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['cs_client_profiles','cs_client_reviews','cs_client_review_answers','cs_location_completions','cs_tasks','cs_risks','cs_qbrs','cs_client_contacts','cs_client_groups','cs_client_group_members','cs_review_templates','cs_review_template_questions'] loop
    execute format('drop trigger if exists %I on public.%I', 'set_' || t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_client_success_updated_at()', 'set_' || t || '_updated_at', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['cs_client_profiles','cs_client_reviews','cs_client_review_answers','cs_location_completions','cs_tasks','cs_risks','cs_qbrs','cs_client_contacts','cs_client_groups','cs_client_group_members','cs_review_templates','cs_review_template_questions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.client_success_is_admin())', t || '_admin_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.client_success_is_admin()) with check (public.client_success_is_admin())', t || '_admin_all', t);
  end loop;
end $$;

grant select, insert, update, delete on public.cs_client_profiles to authenticated;
grant select, insert, update, delete on public.cs_client_reviews to authenticated;
grant select, insert, update, delete on public.cs_client_review_answers to authenticated;
grant select, insert, update, delete on public.cs_location_completions to authenticated;
grant select, insert, update, delete on public.cs_tasks to authenticated;
grant select, insert, update, delete on public.cs_risks to authenticated;
grant select, insert, update, delete on public.cs_qbrs to authenticated;
grant select, insert, update, delete on public.cs_client_contacts to authenticated;
grant select, insert, update, delete on public.cs_client_groups to authenticated;
grant select, insert, update, delete on public.cs_client_group_members to authenticated;
grant select, insert, update, delete on public.cs_review_templates to authenticated;
grant select, insert, update, delete on public.cs_review_template_questions to authenticated;

-- Runtime permission matrix seed: Admin only.
do $$
declare
  resources text[] := array['client_success','cs_client_profiles','cs_client_reviews','cs_location_completions','cs_tasks','cs_risks','cs_qbrs','cs_client_contacts','cs_client_groups','cs_client_group_members','cs_review_templates','cs_review_template_questions'];
  actions text[] := array['view','list','get','create','update','delete','manage','export'];
  r text;
  a text;
begin
  if to_regclass('public.role_permissions') is null then
    raise notice 'role_permissions table not found; frontend base matrix still keeps Client Success admin-only.';
    return;
  end if;

  update public.role_permissions
     set is_allowed = false,
         is_active = false,
         updated_at = now()
   where resource = any(resources)
     and lower(trim(coalesce(role_key, ''))) <> 'admin';

  foreach r in array resources loop
    foreach a in array actions loop
      if exists (select 1 from public.role_permissions where lower(trim(coalesce(role_key,''))) = 'admin' and resource = r and action = a) then
        update public.role_permissions
           set is_allowed = true,
               is_active = true,
               allowed_roles = array['admin']::text[],
               updated_at = now()
         where lower(trim(coalesce(role_key,''))) = 'admin'
           and resource = r
           and action = a;
      else
        insert into public.role_permissions (permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at)
        values (gen_random_uuid(), 'admin', r, a, true, true, array['admin']::text[], now(), now());
      end if;
    end loop;
  end loop;
end $$;
