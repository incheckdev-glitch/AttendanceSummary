begin;

alter table if exists communication_centre_messages
  add column if not exists reply_to_message_id uuid null,
  add column if not exists edited_at timestamptz null,
  add column if not exists edited_by uuid null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists message_type text not null default 'message';

alter table if exists communication_centre_conversations
  add column if not exists follow_up_at timestamptz null,
  add column if not exists follow_up_by uuid null,
  add column if not exists follow_up_status text not null default 'pending',
  add column if not exists is_escalated boolean not null default false,
  add column if not exists escalated_at timestamptz null,
  add column if not exists escalated_by uuid null;

create table if not exists communication_centre_message_mentions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  conversation_id uuid not null,
  mentioned_user_id uuid not null,
  mentioned_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists communication_centre_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null,
  reaction text not null,
  created_at timestamptz not null default now(),
  unique(message_id, user_id, reaction)
);

create table if not exists communication_centre_action_items (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  source_message_id uuid null,
  title text not null,
  assigned_to uuid null,
  due_at timestamptz null,
  status text not null default 'open',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  completed_by uuid null
);

insert into notification_actions(resource, action_key, action_label, is_enabled)
values
('communication_centre','user_mentioned','User Mentioned', true),
('communication_centre','role_mentioned','Role Mentioned', true),
('communication_centre','conversation_escalated','Conversation Escalated', false),
('communication_centre','action_item_assigned','Action Item Assigned', false),
('communication_centre','action_item_completed','Action Item Completed', false),
('communication_centre','follow_up_due','Follow-up Due', false)
on conflict do nothing;

commit;
