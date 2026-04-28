create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  action text not null,
  description text not null default '',
  is_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  pwa_enabled boolean not null default true,
  email_enabled boolean not null default false,
  recipient_roles text[] not null default '{}',
  recipient_user_ids uuid[] not null default '{}',
  recipient_emails text[] not null default '{}',
  users_from_record text[] not null default '{}',
  exclude_actor boolean not null default true,
  dedupe_window_seconds integer not null default 60,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(resource, action)
);

create index if not exists notification_rules_resource_action_idx on public.notification_rules(resource, action);

insert into public.notification_rules(resource, action, recipient_roles)
values
  ('tickets','ticket_created', array['admin','dev']),
  ('tickets','ticket_high_priority', array['admin','dev']),
  ('tickets','ticket_status_changed', array['admin']),
  ('tickets','ticket_dev_team_status_changed', array['admin']),
  ('tickets','ticket_under_development', array['dev']),
  ('leads','lead_created', array['admin','sales_executive']),
  ('proposals','proposal_requires_approval', array['financial_controller','gm']),
  ('agreements','agreement_signed', array['admin','accounting','hoo']),
  ('technical_admin_requests','technical_request_submitted', array['admin','dev','hoo']),
  ('workflow','workflow_approval_requested', array['financial_controller','gm'])
on conflict (resource, action) do nothing;
