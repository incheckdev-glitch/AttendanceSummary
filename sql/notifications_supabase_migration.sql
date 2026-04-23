-- Supabase notification migration (phase 1)
-- Scope: in-app notifications for workflow approval requests and workflow approval decisions.
-- Run this once in Supabase SQL Editor before deploying the updated frontend bundle.

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null default '',
  type text not null default 'general',
  resource text not null default 'notifications',
  resource_id text null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'unread',
  is_read boolean not null default false,
  read_at timestamptz null,
  action_required boolean not null default false,
  action_label text null,
  link_target text null,
  meta jsonb not null default '{}'::jsonb,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  actor_role text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, is_read, created_at desc);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists notifications_resource_idx
  on public.notifications (resource, resource_id);

create index if not exists notifications_type_idx
  on public.notifications (type);

create index if not exists notifications_meta_gin_idx
  on public.notifications using gin (meta);

create or replace function public.set_notifications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  if new.is_read = true and new.read_at is null then
    new.read_at := timezone('utc', now());
  end if;
  if new.is_read = true then
    new.status := 'read';
  elsif coalesce(new.status, '') = '' then
    new.status := 'unread';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifications_updated_at on public.notifications;
create trigger trg_notifications_updated_at
before update on public.notifications
for each row
execute function public.set_notifications_updated_at();

alter table public.notifications enable row level security;

-- Clean up old policies if the script is re-run.
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;

do $$
begin
  create policy notifications_select_own
    on public.notifications
    for select
    to authenticated
    using ((select auth.uid()) = recipient_user_id);

  create policy notifications_update_own
    on public.notifications
    for update
    to authenticated
    using ((select auth.uid()) = recipient_user_id)
    with check ((select auth.uid()) = recipient_user_id);
exception
  when duplicate_object then
    null;
end $$;

grant select, update on public.notifications to authenticated;
revoke insert, delete on public.notifications from anon, authenticated;

create or replace function public.notify_workflow_approval_request(p_approval_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_approval public.workflow_approvals%rowtype;
  v_requester public.profiles%rowtype;
  v_roles text[];
  v_target_resource text;
  v_target_label text;
  v_record_label text;
  v_company text;
  v_requested_status text;
  v_current_status text;
  v_title text;
  v_message text;
  v_inserted integer := 0;
begin
  if v_caller is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_approval
  from public.workflow_approvals
  where approval_id = p_approval_id
  limit 1;

  if not found then
    raise exception 'Workflow approval % was not found', p_approval_id;
  end if;

  if v_approval.requester_user_id is not null and v_approval.requester_user_id <> v_caller then
    raise exception 'Only the requester can dispatch approval-request notifications';
  end if;

  if v_approval.status is distinct from 'pending' then
    return 0;
  end if;

  select *
  into v_requester
  from public.profiles
  where id = v_approval.requester_user_id
  limit 1;

  v_roles := array(
    select lower(trim(value))
    from unnest(regexp_split_to_array(coalesce(v_approval.approval_role, ''), '\s*,\s*')) as value
    where trim(value) <> ''
  );

  if coalesce(array_length(v_roles, 1), 0) = 0 then
    return 0;
  end if;

  v_target_resource := lower(coalesce(v_approval.resource, 'workflow'));
  v_target_label := initcap(replace(v_target_resource, '_', ' '));
  v_record_label := coalesce(
    nullif(v_approval.requested_changes ->> 'proposal_number', ''),
    nullif(v_approval.requested_changes ->> 'agreement_number', ''),
    nullif(v_approval.requested_changes ->> 'invoice_number', ''),
    nullif(v_approval.requested_changes ->> 'receipt_number', ''),
    nullif(v_approval.requested_changes ->> 'proposal_id', ''),
    nullif(v_approval.requested_changes ->> 'agreement_id', ''),
    nullif(v_approval.requested_changes ->> 'invoice_id', ''),
    nullif(v_approval.requested_changes ->> 'receipt_id', ''),
    nullif(v_approval.record_id, ''),
    'record'
  );
  v_company := coalesce(
    nullif(v_approval.requested_changes ->> 'client_name', ''),
    nullif(v_approval.requested_changes ->> 'company_name', ''),
    ''
  );
  v_current_status := coalesce(nullif(v_approval.old_status, ''), nullif(v_approval.requested_changes ->> 'current_status', ''), 'Current');
  v_requested_status := coalesce(nullif(v_approval.new_status, ''), nullif(v_approval.requested_changes ->> 'requested_status', ''), 'Requested');

  v_title := format('Approval required · %s · %s', v_target_label, v_record_label);
  v_message := trim(both ' ' from concat(
    case when v_company <> '' then v_company || ' · ' else '' end,
    v_current_status,
    ' → ',
    v_requested_status,
    case when coalesce(v_requester.name, '') <> '' then ' · Requested by ' || v_requester.name else '' end
  ));

  insert into public.notifications (
    recipient_user_id,
    title,
    message,
    type,
    resource,
    resource_id,
    priority,
    status,
    is_read,
    action_required,
    action_label,
    link_target,
    meta,
    actor_user_id,
    actor_role
  )
  select
    p.id,
    v_title,
    v_message,
    'workflow_approval_request',
    'workflow',
    v_approval.approval_id,
    case when coalesce(nullif(v_approval.requested_changes ->> 'discount_percent', '')::numeric, 0) > 10 then 'high' else 'normal' end,
    'unread',
    false,
    true,
    'Review approval',
    null,
    jsonb_build_object(
      'approval_id', v_approval.approval_id,
      'target_resource', v_target_resource,
      'target_record_id', v_approval.record_id,
      'record_label', v_record_label,
      'company_name', v_company,
      'current_status', v_current_status,
      'requested_status', v_requested_status,
      'requester_user_id', v_approval.requester_user_id,
      'requester_name', coalesce(v_requester.name, ''),
      'requester_email', coalesce(v_requester.email, ''),
      'requester_role', coalesce(v_approval.requester_role, ''),
      'requested_changes', coalesce(v_approval.requested_changes, '{}'::jsonb)
    ),
    v_approval.requester_user_id,
    coalesce(v_approval.requester_role, '')
  from public.profiles p
  where p.is_active = true
    and lower(coalesce(p.role_key, '')) = any(v_roles)
    and (v_approval.requester_user_id is null or p.id <> v_approval.requester_user_id);

  get diagnostics v_inserted = row_count;
  return coalesce(v_inserted, 0);
end;
$$;

create or replace function public.notify_workflow_decision(
  p_approval_id text,
  p_decision text,
  p_reviewer_comment text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_approval public.workflow_approvals%rowtype;
  v_reviewer public.profiles%rowtype;
  v_target_resource text;
  v_target_label text;
  v_record_label text;
  v_company text;
  v_status_word text;
  v_title text;
  v_message text;
  v_inserted integer := 0;
begin
  if v_caller is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_approval
  from public.workflow_approvals
  where approval_id = p_approval_id
  limit 1;

  if not found then
    raise exception 'Workflow approval % was not found', p_approval_id;
  end if;

  if v_approval.requester_user_id is null then
    return 0;
  end if;

  if v_approval.reviewer_user_id is not null and v_approval.reviewer_user_id <> v_caller then
    raise exception 'Only the reviewer can dispatch decision notifications';
  end if;

  select *
  into v_reviewer
  from public.profiles
  where id = coalesce(v_approval.reviewer_user_id, v_caller)
  limit 1;

  v_target_resource := lower(coalesce(v_approval.resource, 'workflow'));
  v_target_label := initcap(replace(v_target_resource, '_', ' '));
  v_record_label := coalesce(
    nullif(v_approval.requested_changes ->> 'proposal_number', ''),
    nullif(v_approval.requested_changes ->> 'agreement_number', ''),
    nullif(v_approval.requested_changes ->> 'invoice_number', ''),
    nullif(v_approval.requested_changes ->> 'receipt_number', ''),
    nullif(v_approval.requested_changes ->> 'proposal_id', ''),
    nullif(v_approval.requested_changes ->> 'agreement_id', ''),
    nullif(v_approval.requested_changes ->> 'invoice_id', ''),
    nullif(v_approval.requested_changes ->> 'receipt_id', ''),
    nullif(v_approval.record_id, ''),
    'record'
  );
  v_company := coalesce(
    nullif(v_approval.requested_changes ->> 'client_name', ''),
    nullif(v_approval.requested_changes ->> 'company_name', ''),
    ''
  );
  v_status_word := case when lower(coalesce(p_decision, '')) = 'rejected' then 'rejected' else 'approved' end;
  v_title := format('Approval %s · %s · %s', initcap(v_status_word), v_target_label, v_record_label);
  v_message := trim(both ' ' from concat(
    case when v_company <> '' then v_company || ' · ' else '' end,
    'Your request was ', v_status_word,
    case when coalesce(v_reviewer.name, '') <> '' then ' by ' || v_reviewer.name else '' end,
    case when coalesce(p_reviewer_comment, '') <> '' then ' · Comment: ' || p_reviewer_comment else '' end
  ));

  insert into public.notifications (
    recipient_user_id,
    title,
    message,
    type,
    resource,
    resource_id,
    priority,
    status,
    is_read,
    action_required,
    action_label,
    link_target,
    meta,
    actor_user_id,
    actor_role
  )
  values (
    v_approval.requester_user_id,
    v_title,
    v_message,
    case when v_status_word = 'rejected' then 'workflow_approval_rejected' else 'workflow_approval_approved' end,
    v_target_resource,
    coalesce(v_approval.record_id, v_approval.approval_id),
    case when v_status_word = 'rejected' then 'high' else 'normal' end,
    'unread',
    false,
    false,
    'Open record',
    null,
    jsonb_build_object(
      'approval_id', v_approval.approval_id,
      'decision', v_status_word,
      'target_resource', v_target_resource,
      'target_record_id', v_approval.record_id,
      'record_label', v_record_label,
      'company_name', v_company,
      'reviewer_user_id', coalesce(v_approval.reviewer_user_id, v_caller),
      'reviewer_name', coalesce(v_reviewer.name, ''),
      'reviewer_role', coalesce(v_reviewer.role_key, v_approval.approval_role, ''),
      'reviewer_comment', coalesce(p_reviewer_comment, ''),
      'requested_changes', coalesce(v_approval.requested_changes, '{}'::jsonb)
    ),
    coalesce(v_approval.reviewer_user_id, v_caller),
    coalesce(v_reviewer.role_key, v_approval.approval_role, '')
  );

  get diagnostics v_inserted = row_count;
  return coalesce(v_inserted, 0);
end;
$$;

revoke execute on function public.notify_workflow_approval_request(text) from public, anon;
revoke execute on function public.notify_workflow_decision(text, text, text) from public, anon;
grant execute on function public.notify_workflow_approval_request(text) to authenticated;
grant execute on function public.notify_workflow_decision(text, text, text) to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
exception
  when insufficient_privilege then
    null;
  when undefined_object then
    null;
end $$;
