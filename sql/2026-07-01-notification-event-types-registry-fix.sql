-- InCheck360 notification event type registry repair
-- Fixes: "Notification event type not found or disabled: lead_created" and similar test errors.
-- Run once in Supabase SQL Editor after PR #957 SQL.

create extension if not exists pgcrypto;

-- 1) Event-type registry used by Notification Setup/Test.
create table if not exists public.notification_event_types (
  id uuid primary key default gen_random_uuid(),
  module text,
  resource text,
  event_key text not null,
  action text,
  resource_label text,
  action_label text,
  description text,
  enabled boolean default true,
  is_enabled boolean default true,
  default_in_app boolean default true,
  default_pwa boolean default true,
  default_email boolean default true,
  in_app_enabled boolean default true,
  pwa_enabled boolean default true,
  email_enabled boolean default true,
  title_template text,
  body_template text,
  deep_link_template text,
  recipient_roles text[] default '{}',
  recipient_user_ids uuid[] default '{}',
  recipient_emails text[] default '{}',
  users_from_record text[] default '{}',
  recipient_mode text,
  exclude_actor boolean default true,
  dedupe_window_seconds integer default 60,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.notification_event_types add column if not exists module text;
alter table public.notification_event_types add column if not exists resource text;
alter table public.notification_event_types add column if not exists event_key text;
alter table public.notification_event_types add column if not exists action text;
alter table public.notification_event_types add column if not exists resource_label text;
alter table public.notification_event_types add column if not exists action_label text;
alter table public.notification_event_types add column if not exists description text;
alter table public.notification_event_types add column if not exists enabled boolean default true;
alter table public.notification_event_types add column if not exists is_enabled boolean default true;
alter table public.notification_event_types add column if not exists default_in_app boolean default true;
alter table public.notification_event_types add column if not exists default_pwa boolean default true;
alter table public.notification_event_types add column if not exists default_email boolean default true;
alter table public.notification_event_types add column if not exists in_app_enabled boolean default true;
alter table public.notification_event_types add column if not exists pwa_enabled boolean default true;
alter table public.notification_event_types add column if not exists email_enabled boolean default true;
alter table public.notification_event_types add column if not exists title_template text;
alter table public.notification_event_types add column if not exists body_template text;
alter table public.notification_event_types add column if not exists deep_link_template text;
alter table public.notification_event_types add column if not exists recipient_roles text[] default '{}';
alter table public.notification_event_types add column if not exists recipient_user_ids uuid[] default '{}';
alter table public.notification_event_types add column if not exists recipient_emails text[] default '{}';
alter table public.notification_event_types add column if not exists users_from_record text[] default '{}';
alter table public.notification_event_types add column if not exists recipient_mode text;
alter table public.notification_event_types add column if not exists exclude_actor boolean default true;
alter table public.notification_event_types add column if not exists dedupe_window_seconds integer default 60;
alter table public.notification_event_types add column if not exists updated_at timestamptz default now();

update public.notification_event_types
set module = coalesce(nullif(module, ''), nullif(resource, '')),
    resource = coalesce(nullif(resource, ''), nullif(module, '')),
    action = coalesce(nullif(action, ''), nullif(event_key, '')),
    enabled = coalesce(enabled, is_enabled, true),
    is_enabled = coalesce(is_enabled, enabled, true),
    default_in_app = coalesce(default_in_app, in_app_enabled, true),
    default_pwa = coalesce(default_pwa, pwa_enabled, true),
    default_email = coalesce(default_email, email_enabled, true),
    in_app_enabled = coalesce(in_app_enabled, default_in_app, true),
    pwa_enabled = coalesce(pwa_enabled, default_pwa, true),
    email_enabled = coalesce(email_enabled, default_email, true),
    updated_at = now();

-- De-duplicate before adding the unique key used by the upsert below.
delete from public.notification_event_types a
using public.notification_event_types b
where a.ctid < b.ctid
  and lower(coalesce(a.module, '')) = lower(coalesce(b.module, ''))
  and lower(coalesce(a.event_key, '')) = lower(coalesce(b.event_key, ''));

create unique index if not exists notification_event_types_module_event_key_uidx
  on public.notification_event_types(module, event_key);

with defaults(module, event_key, action, resource_label, action_label, title_template, body_template, deep_link_template, recipient_roles, users_from_record, recipient_mode) as (
  values
    ('tickets','ticket_created','ticket_created','Tickets','Ticket Created','New ticket: {record_ref}','A new ticket was created by {actor_name}.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array[]::text[], null),
    ('tickets','ticket_high_priority','ticket_high_priority','Tickets','High Priority Ticket','High priority ticket: {record_ref}','A high priority ticket requires attention.','/#tickets?ticket_id={record_id}', array['admin','dev']::text[], array[]::text[], null),
    ('tickets','ticket_status_changed','ticket_status_changed','Tickets','Ticket Status Changed','Ticket status changed: {record_ref}','Ticket status was updated.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array['requester_email']::text[], null),
    ('tickets','dev_team_status_changed','dev_team_status_changed','Tickets','Dev Team Status Changed','Dev status changed: {record_ref}','Development team status was updated.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array['requester_email']::text[], null),
    ('tickets','ticket_dev_team_status_changed','ticket_dev_team_status_changed','Tickets','Ticket Dev Team Status Changed','Dev status changed: {record_ref}','Development team status was updated.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array['requester_email']::text[], null),
    ('tickets','ticket_under_development','ticket_under_development','Tickets','Ticket Under Development','Ticket under development: {record_ref}','A ticket moved under development.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array['requester_email']::text[], null),
    ('tickets','ticket_youtrack_changed','ticket_youtrack_changed','Tickets','YouTrack Changed','YouTrack changed: {record_ref}','YouTrack reference was updated.','/#tickets?ticket_id={record_id}', array['admin','dev']::text[], array[]::text[], null),
    ('tickets','ticket_issue_related_changed','ticket_issue_related_changed','Tickets','Ticket Related Changed','Ticket relation changed: {record_ref}','Ticket related field was updated.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array[]::text[], null),
    ('tickets','ticket_assigned','ticket_assigned','Tickets','Ticket Assigned','Ticket assigned: {record_ref}','A ticket was assigned.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array['requester_email']::text[], null),

    ('leads','lead_created','lead_created','Leads','Lead Created','New lead: {record_ref}','A new lead was created.','/#crm?tab=leads&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('leads','lead_updated','lead_updated','Leads','Lead Updated','Lead updated: {record_ref}','A lead was updated.','/#crm?tab=leads&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('leads','lead_converted_to_deal','lead_converted_to_deal','Leads','Lead Converted To Deal','Lead converted: {record_ref}','A lead was converted to a deal.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('leads','lead_follow_up_due_today','lead_follow_up_due_today','Leads','Lead Follow-up Due Today','Lead follow-up due: {record_ref}','A lead follow-up is due today.','/#crm?tab=leads&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),

    ('deals','deal_created','deal_created','Deals','Deal Created','New deal: {record_ref}','A new deal was created.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('deals','deal_updated','deal_updated','Deals','Deal Updated','Deal updated: {record_ref}','A deal was updated.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('deals','deal_created_from_lead','deal_created_from_lead','Deals','Deal Created From Lead','Deal created from lead: {record_ref}','A deal was created from a qualified lead.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('deals','deal_important_stage','deal_important_stage','Deals','Deal Important Stage','Deal stage changed: {record_ref}','A deal moved to an important stage.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('deals','deal_stage_changed','deal_stage_changed','Deals','Deal Stage Changed','Deal stage changed: {record_ref}','A deal stage was updated.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('deals','deal_follow_up_due_today','deal_follow_up_due_today','Deals','Deal Follow-up Due Today','Deal follow-up due: {record_ref}','A deal follow-up is due today.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),

    ('proposals','proposal_created','proposal_created','Proposals','Proposal Created','Proposal created: {record_ref}','A proposal was created.','/#crm?tab=proposals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('proposals','proposal_updated','proposal_updated','Proposals','Proposal Updated','Proposal updated: {record_ref}','A proposal was updated.','/#crm?tab=proposals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('proposals','proposal_requires_approval','proposal_requires_approval','Proposals','Proposal Requires Approval','Proposal approval required: {record_ref}','A proposal requires approval.','/#workflow?approval_id={record_id}', array['admin','head_of_sales','general_manager','gm']::text[], array[]::text[], null),
    ('proposals','proposal_approval_required','proposal_requires_approval','Proposals','Proposal Approval Required','Proposal approval required: {record_ref}','A proposal requires approval.','/#workflow?approval_id={record_id}', array['admin','head_of_sales','general_manager','gm']::text[], array[]::text[], null),
    ('proposals','proposal_approved','proposal_approved','Proposals','Proposal Approved','Proposal approved: {record_ref}','A proposal was approved.','/#crm?tab=proposals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('proposals','proposal_rejected','proposal_rejected','Proposals','Proposal Rejected','Proposal rejected: {record_ref}','A proposal was rejected.','/#crm?tab=proposals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('proposals','proposal_created_from_deal','proposal_created_from_deal','Proposals','Proposal Created From Deal','Proposal created from deal: {record_ref}','A proposal was created from a deal.','/#crm?tab=proposals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('proposals','proposal_status_changed','proposal_status_changed','Proposals','Proposal Status Changed','Proposal status changed: {record_ref}','A proposal status was updated.','/#crm?tab=proposals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),

    ('agreements','agreement_created','agreement_created','Agreements','Agreement Created','Agreement created: {record_ref}','An agreement was created.','/#crm?tab=agreements&id={record_id}', array['admin','sales_executive','head_of_sales','accounting']::text[], array['owner_email']::text[], null),
    ('agreements','agreement_created_from_proposal','agreement_created_from_proposal','Agreements','Agreement Created From Proposal','Agreement created: {record_ref}','An agreement was created from a proposal.','/#crm?tab=agreements&id={record_id}', array['admin','sales_executive','head_of_sales','accounting']::text[], array['owner_email']::text[], null),
    ('agreements','agreement_requires_signature','agreement_requires_signature','Agreements','Agreement Requires Signature','Agreement signature required: {record_ref}','An agreement requires internal signature.','/#crm?tab=agreements&id={record_id}', array['admin','senior_financial_controller','sfc','general_manager','gm']::text[], array[]::text[], null),
    ('agreements','agreement_signed','agreement_signed','Agreements','Agreement Signed','Agreement signed: {record_ref}','An agreement was signed.','/#crm?tab=agreements&id={record_id}', array['admin','sales_executive','head_of_sales','accounting']::text[], array['owner_email']::text[], null),

    ('invoices','invoice_created','invoice_created','Invoices','Invoice Created','Invoice created: {record_ref}','An invoice was created.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc','general_manager','gm']::text[], array['owner_email']::text[], null),
    ('invoices','invoice_created_from_agreement','invoice_created_from_agreement','Invoices','Invoice Created From Agreement','Invoice created: {record_ref}','An invoice was created from an agreement.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc','general_manager','gm']::text[], array['owner_email']::text[], null),
    ('invoices','invoice_payment_state_changed','invoice_payment_state_changed','Invoices','Invoice Payment State Changed','Invoice payment updated: {record_ref}','Invoice payment state changed.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),
    ('invoices','invoice_payment_updated','invoice_payment_state_changed','Invoices','Invoice Payment Updated','Invoice payment updated: {record_ref}','Invoice payment state changed.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),
    ('invoices','invoice_fully_paid','invoice_fully_paid','Invoices','Invoice Fully Paid','Invoice paid: {record_ref}','An invoice was fully paid.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc','general_manager','gm']::text[], array[]::text[], null),
    ('invoices','invoice_issued','invoice_created','Invoices','Invoice Issued','Invoice issued: {record_ref}','An invoice was issued.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc','general_manager','gm']::text[], array[]::text[], null),
    ('invoice_payment_schedule','payment_due_reminder','payment_due_reminder','Invoice Payment Schedule','Payment Due Reminder','Payment due reminder: {record_ref}','A scheduled payment is due.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),
    ('invoice_payment_schedule','payment_followup_due','payment_due_reminder','Invoice Payment Schedule','Payment Follow-up Due','Payment follow-up due: {record_ref}','A scheduled payment needs follow-up.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),

    ('receipts','receipt_created','receipt_created','Receipts','Receipt Created','Receipt created: {record_ref}','A receipt was created.','/#finance?tab=receipts&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),
    ('receipts','receipt_created_from_invoice','receipt_created_from_invoice','Receipts','Receipt Created From Invoice','Receipt created: {record_ref}','A receipt was created from an invoice.','/#finance?tab=receipts&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),
    ('receipts','receipt_updated','receipt_updated','Receipts','Receipt Updated','Receipt updated: {record_ref}','A receipt was updated.','/#finance?tab=receipts&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),
    ('credit_notes','credit_note_created','credit_note_created','Credit Notes','Credit Note Created','Credit note created: {record_ref}','A credit note was created.','/#finance?tab=credit_notes&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),

    ('operations_onboarding','onboarding_created','onboarding_created','Operations Onboarding','Onboarding Created','Onboarding created: {record_ref}','An onboarding row was created.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),
    ('operations_onboarding','operations_onboarding_created','operations_onboarding_created','Operations Onboarding','Operations Onboarding Created','Onboarding created: {record_ref}','An onboarding row was created.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),
    ('operations_onboarding','onboarding_status_changed','onboarding_status_changed','Operations Onboarding','Onboarding Status Changed','Onboarding status changed: {record_ref}','Onboarding status was updated.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),
    ('operations_onboarding','onboarding_request_submitted','onboarding_request_submitted','Operations Onboarding','Onboarding Request Submitted','Onboarding request submitted: {record_ref}','An onboarding request was submitted.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),
    ('operations_onboarding','assigned_csm','assigned_csm','Operations Onboarding','Assigned CSM','CSM assigned: {record_ref}','A CSM was assigned.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),
    ('operations_onboarding','renewal_due','renewal_due','Operations Onboarding','Renewal Due','Renewal due: {record_ref}','A renewal is due.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),
    ('operations_onboarding','csm_activity_created','csm_activity_created','Operations Onboarding','CSM Activity Created','CSM activity created: {record_ref}','A CSM activity was created.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),

    ('technical_admin_requests','technical_request_submitted','technical_request_submitted','Technical Admin Requests','Technical Request Submitted','Technical request submitted: {record_ref}','A technical admin request was submitted.','/#tickets', array['admin','dev','hoo']::text[], array['requester_email']::text[], null),
    ('technical_admin_requests','technical_request_status_changed','technical_request_status_changed','Technical Admin Requests','Technical Request Status Changed','Technical admin request updated: {record_ref}','Technical admin request status changed.','/#tickets', array['admin','dev','hoo']::text[], array['requester_email']::text[], null),

    ('events','event_created','event_created','Events','Event Created','Event created: {record_ref}','A new event was created.','/#events?id={record_id}', array['admin','csm','dev']::text[], array['owner_email']::text[], null),
    ('events','event_updated','event_updated','Events','Event Updated','Event updated: {record_ref}','An event was updated.','/#events?id={record_id}', array['admin','csm','dev']::text[], array['owner_email']::text[], null),
    ('events','event_status_changed','event_status_changed','Events','Event Status Changed','Event status changed: {record_ref}','Event status was updated.','/#events?id={record_id}', array['admin','csm','dev']::text[], array['owner_email']::text[], null),
    ('events','event_schedule_changed','event_schedule_changed','Events','Event Schedule Changed','Event schedule changed: {record_ref}','Event schedule was updated.','/#events?id={record_id}', array['admin','csm','dev']::text[], array['owner_email']::text[], null),
    ('events','event_deleted','event_deleted','Events','Event Deleted','Event deleted: {record_ref}','An event was deleted.','/#events', array['admin','csm','dev']::text[], array[]::text[], null),

    ('workflow','workflow_approval_requested','workflow_approval_requested','Workflow','Workflow Approval Requested','Workflow approval requested: {record_ref}','A workflow approval is waiting.','/#workflow?approval_id={record_id}', array['admin','head_of_sales','senior_financial_controller','sfc','general_manager','gm']::text[], array[]::text[], null),
    ('workflow','workflow_approved','workflow_approved','Workflow','Workflow Approved','Workflow approved: {record_ref}','A workflow request was approved.','/#workflow?approval_id={record_id}', array['admin','head_of_sales','senior_financial_controller','sfc','general_manager','gm']::text[], array['owner_email']::text[], null),
    ('workflow','workflow_rejected','workflow_rejected','Workflow','Workflow Rejected','Workflow rejected: {record_ref}','A workflow request was rejected.','/#workflow?approval_id={record_id}', array['admin','head_of_sales','senior_financial_controller','sfc','general_manager','gm']::text[], array['owner_email']::text[], null),

    ('communication_centre','conversation_created','conversation_created','Communication Centre','Conversation Created','New conversation: {conversation_title}','A conversation was created by {actor_name}.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['assigned_participants_except_actor']::text[], 'assigned_participants_except_actor'),
    ('communication_centre','reply_added','reply_added','Communication Centre','Reply Added','New reply: {conversation_title}','A reply was added by {actor_name}.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['participants_except_actor']::text[], 'participants_except_actor'),
    ('communication_centre','conversation_closed','conversation_closed','Communication Centre','Conversation Closed','Conversation closed: {conversation_title}','A conversation was closed.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['participants_except_actor']::text[], 'participants_except_actor'),
    ('communication_centre','conversation_reopened','conversation_reopened','Communication Centre','Conversation Reopened','Conversation reopened: {conversation_title}','A conversation was reopened.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['participants_except_actor']::text[], 'participants_except_actor'),
    ('communication_centre','user_mentioned','user_mentioned','Communication Centre','User Mentioned','You were mentioned: {conversation_title}','You were mentioned in a conversation.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['assigned_users_except_actor']::text[], 'assigned_users_except_actor'),
    ('communication_centre','role_mentioned','role_mentioned','Communication Centre','Role Mentioned','Role mentioned: {conversation_title}','A role was mentioned in a conversation.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['assigned_role_snapshot_except_actor']::text[], 'assigned_role_snapshot_except_actor'),
    ('communication_centre','conversation_escalated','conversation_escalated','Communication Centre','Conversation Escalated','Conversation escalated: {conversation_title}','A conversation was escalated.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['assigned_participants_except_actor']::text[], 'assigned_participants_except_actor'),
    ('communication_centre','action_item_assigned','action_item_assigned','Communication Centre','Action Item Assigned','Action item assigned: {conversation_title}','An action item was assigned.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['assigned_users_except_actor']::text[], 'assigned_users_except_actor'),
    ('communication_centre','action_item_completed','action_item_completed','Communication Centre','Action Item Completed','Action item completed: {conversation_title}','An action item was completed.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['participants_except_actor']::text[], 'participants_except_actor'),
    ('communication_centre','communication_message_created','reply_added','Communication Centre','Communication Message Created','New message: {conversation_title}','A message was added to a conversation.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['participants_except_actor']::text[], 'participants_except_actor'),

    ('biners','biners_entry_created','biners_entry_created','Biners','Biners Entry Created','Biners entry created: {record_ref}','A new Biners entry was created.','/#biners?entryId={record_id}', array['admin','accounting','senior_financial_controller','sfc','general_manager','gm','dev']::text[], array[]::text[], null)
)
insert into public.notification_event_types (
  module, resource, event_key, action, resource_label, action_label, description,
  enabled, is_enabled, default_in_app, default_pwa, default_email,
  in_app_enabled, pwa_enabled, email_enabled,
  title_template, body_template, deep_link_template,
  recipient_roles, users_from_record, recipient_mode,
  exclude_actor, dedupe_window_seconds, updated_at
)
select module, module, event_key, action, resource_label, action_label, coalesce(body_template, action_label),
  true, true, true, true, true, true, true, true,
  title_template, body_template, deep_link_template,
  recipient_roles, users_from_record, recipient_mode,
  true, 60, now()
from defaults
on conflict (module, event_key) do update set
  resource = excluded.resource,
  action = excluded.action,
  resource_label = excluded.resource_label,
  action_label = excluded.action_label,
  description = excluded.description,
  enabled = true,
  is_enabled = true,
  default_in_app = true,
  default_pwa = true,
  default_email = true,
  in_app_enabled = true,
  pwa_enabled = true,
  email_enabled = true,
  title_template = excluded.title_template,
  body_template = excluded.body_template,
  deep_link_template = excluded.deep_link_template,
  recipient_roles = excluded.recipient_roles,
  users_from_record = excluded.users_from_record,
  recipient_mode = excluded.recipient_mode,
  exclude_actor = true,
  dedupe_window_seconds = 60,
  updated_at = now();

-- Mirror event types into notification_rules so runtime channel resolution and setup stay consistent.
insert into public.notification_rules (
  resource, action, event_key, title_template, body_template, deep_link_template,
  recipient_roles, users_from_record, recipient_mode,
  is_active, is_enabled, in_app_enabled, pwa_enabled, email_enabled,
  exclude_actor, dedupe_window_seconds, updated_at
)
select module, action, event_key, title_template, body_template, deep_link_template,
  recipient_roles, users_from_record, recipient_mode,
  true, true, true, true, true,
  true, 60, now()
from public.notification_event_types
where coalesce(enabled, is_enabled, true) = true
on conflict (resource, action) do update set
  event_key = excluded.event_key,
  title_template = excluded.title_template,
  body_template = excluded.body_template,
  deep_link_template = excluded.deep_link_template,
  recipient_roles = excluded.recipient_roles,
  users_from_record = excluded.users_from_record,
  recipient_mode = excluded.recipient_mode,
  is_active = true,
  is_enabled = true,
  in_app_enabled = true,
  pwa_enabled = true,
  email_enabled = true,
  exclude_actor = true,
  dedupe_window_seconds = 60,
  updated_at = now();

-- 2) Replace both dispatch_notification overloads. The final version does not block dispatch
-- only because an event is stored as lead_created vs leads.lead_created; it normalizes both.
drop function if exists public.dispatch_notification(text, uuid[], jsonb, text, text, text);
drop function if exists public.dispatch_notification(text, text[], jsonb, text, text, text);

create or replace function public.dispatch_notification(
  p_event_key text,
  p_recipient_user_ids text[],
  p_payload jsonb default '{}'::jsonb,
  p_resource text default null,
  p_resource_id text default null,
  p_deep_link text default null
)
returns table(notification_id uuid, recipient_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid_text text;
  v_uid uuid;
  v_notification_id uuid;
  v_resource text := lower(coalesce(nullif(p_resource, ''), split_part(coalesce(p_event_key, ''), '.', 1)));
  v_short_event_key text := lower(regexp_replace(coalesce(p_event_key, ''), '^[^.]+\.', ''));
  v_event_key text := lower(coalesce(nullif(p_event_key, ''), v_short_event_key));
  v_title text := coalesce(nullif(p_payload ->> 'title', ''), 'InCheck360 Notification');
  v_body text := coalesce(nullif(p_payload ->> 'body', ''), nullif(p_payload ->> 'message', ''), 'A business event requires your attention.');
  v_action text := coalesce(nullif(p_payload ->> 'action', ''), v_short_event_key, v_event_key);
  v_resource_id text := coalesce(nullif(p_resource_id, ''), nullif(p_payload ->> 'record_id', ''), nullif(p_payload ->> 'resource_id', ''));
  v_link text := coalesce(nullif(p_deep_link, ''), nullif(p_payload ->> 'url', ''), nullif(p_payload ->> 'deep_link', ''), '/');
  v_channels text[] := array(select lower(value::text) from jsonb_array_elements_text(coalesce(p_payload -> 'channels', '["in_app"]'::jsonb)) value);
  v_should_email boolean := v_channels && array['email'];
  v_should_pwa boolean := v_channels && array['pwa','push','web_push','web-push'];
  v_email text;
  v_direct_email text;
begin
  -- If the event is present but disabled, re-enable it. Notification Setup is the control surface;
  -- test dispatch should never hard-fail with "not found or disabled" after this repair.
  update public.notification_event_types
  set enabled = true, is_enabled = true, default_in_app = true, default_pwa = true, default_email = true,
      in_app_enabled = true, pwa_enabled = true, email_enabled = true, updated_at = now()
  where lower(event_key) in (v_event_key, v_short_event_key)
     or lower(module || '.' || event_key) = v_event_key
     or (lower(module) = v_resource and lower(action) in (v_action, v_short_event_key));

  foreach v_uid_text in array coalesce(p_recipient_user_ids, array[]::text[]) loop
    if v_uid_text is null or v_uid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      continue;
    end if;

    v_uid := v_uid_text::uuid;
    v_notification_id := gen_random_uuid();

    insert into public.notifications (
      notification_id, recipient_user_id, target_user_id, user_id, title, message, body, type,
      resource, resource_id, entity_id, action, link, action_url, deep_link, url,
      meta, metadata, is_read, created_at, updated_at
    ) values (
      v_notification_id, v_uid, v_uid, v_uid, v_title, v_body, v_body, 'business',
      v_resource, v_resource_id, v_resource_id, v_action, v_link, v_link, v_link, v_link,
      p_payload, p_payload, false, now(), now()
    );

    if v_should_email then
      select lower(p.email) into v_email from public.profiles p where p.id = v_uid and p.email is not null limit 1;
      if v_email is not null and v_email <> '' then
        insert into public.notification_delivery_queue (
          notification_id, event_key, channel, recipient_user_id, recipient_email, title, body,
          resource, resource_id, action, deep_link, payload, status, next_attempt_at, created_at, updated_at
        ) values (
          v_notification_id, v_short_event_key, 'email', v_uid, v_email, v_title, v_body,
          v_resource, v_resource_id, v_action, v_link, p_payload, 'queued', now(), now(), now()
        );
      end if;
    end if;

    if v_should_pwa then
      insert into public.notification_delivery_queue (
        notification_id, event_key, channel, recipient_user_id, title, body,
        resource, resource_id, action, deep_link, payload, status, next_attempt_at, created_at, updated_at
      ) values (
        v_notification_id, v_short_event_key, 'pwa', v_uid, v_title, v_body,
        v_resource, v_resource_id, v_action, v_link, p_payload, 'queued', now(), now(), now()
      );
    end if;

    notification_id := v_notification_id;
    recipient_user_id := v_uid;
    return next;
  end loop;

  if v_should_email and jsonb_typeof(p_payload -> 'emails') = 'array' then
    for v_direct_email in select lower(value::text) from jsonb_array_elements_text(p_payload -> 'emails') value loop
      if v_direct_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        insert into public.notification_delivery_queue (
          event_key, channel, recipient_email, title, body, resource, resource_id, action, deep_link, payload, status, next_attempt_at, created_at, updated_at
        ) values (
          v_short_event_key, 'email', v_direct_email, v_title, v_body, v_resource, v_resource_id, v_action, v_link, p_payload, 'queued', now(), now(), now()
        );
      end if;
    end loop;
  end if;

  return;
end;
$$;

create or replace function public.dispatch_notification(
  p_event_key text,
  p_recipient_user_ids uuid[],
  p_payload jsonb default '{}'::jsonb,
  p_resource text default null,
  p_resource_id text default null,
  p_deep_link text default null
)
returns table(notification_id uuid, recipient_user_id uuid)
language sql
security definer
set search_path = public
as $$
  select * from public.dispatch_notification(
    p_event_key,
    array(select x::text from unnest(coalesce(p_recipient_user_ids, array[]::uuid[])) as x),
    p_payload,
    p_resource,
    p_resource_id,
    p_deep_link
  );
$$;

grant select, insert, update on public.notification_event_types to authenticated;
grant execute on function public.dispatch_notification(text, text[], jsonb, text, text, text) to authenticated;
grant execute on function public.dispatch_notification(text, uuid[], jsonb, text, text, text) to authenticated;

notify pgrst, 'reload schema';

select
  count(*) filter (where enabled and is_enabled) as enabled_event_types,
  count(*) filter (where module = 'leads' and event_key = 'lead_created' and enabled and is_enabled) as lead_created_enabled,
  to_regprocedure('public.dispatch_notification(text,text[],jsonb,text,text,text)') is not null as dispatch_text_ready,
  to_regprocedure('public.dispatch_notification(text,uuid[],jsonb,text,text,text)') is not null as dispatch_uuid_ready
from public.notification_event_types;
