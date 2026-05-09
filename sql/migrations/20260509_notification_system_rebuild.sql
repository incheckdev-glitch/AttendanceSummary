-- InCheck360 central notification dispatcher rebuild.
-- Debug queries:
-- select * from notification_delivery_log order by created_at desc limit 50;
-- select * from push_notification_log order by created_at desc limit 50;
-- select * from notifications order by created_at desc limit 50;

alter table if exists public.notification_rules
  add column if not exists title_template text,
  add column if not exists body_template text,
  add column if not exists deep_link_template text,
  add column if not exists resource_label text,
  add column if not exists action_label text,
  add column if not exists recipient_mode text,
  add column if not exists priority text not null default 'normal',
  add column if not exists in_app_enabled boolean not null default true,
  add column if not exists pwa_enabled boolean not null default true,
  add column if not exists email_enabled boolean not null default false,
  add column if not exists recipient_roles text[] not null default '{}',
  add column if not exists recipient_user_ids uuid[] not null default '{}',
  add column if not exists recipient_emails text[] not null default '{}',
  add column if not exists users_from_record text[] not null default '{}',
  add column if not exists exclude_actor boolean not null default true,
  add column if not exists dedupe_window_seconds integer not null default 60,
  add column if not exists allow_direct_recipients boolean not null default false;

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  action text not null,
  event_key text,
  record_id text,
  record_number text,
  title text,
  body text,
  url text,
  metadata jsonb not null default '{}'::jsonb,
  channels text[] not null default '{}',
  recipient_count integer not null default 0,
  rule_id uuid null references public.notification_rules(id) on delete set null,
  actor_user_id uuid null,
  actor_email text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notification_delivery_log (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid null references public.notification_events(id) on delete set null,
  channel text not null check (channel in ('in_app','pwa','email')),
  status text not null check (status in ('sent','skipped','failed')),
  recipient_user_id uuid null,
  recipient_email text null,
  resource text,
  action text,
  record_id text,
  error_message text,
  provider_message_id text,
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists notification_events_resource_action_record_idx on public.notification_events(resource, action, record_id, created_at desc);
create index if not exists notification_delivery_log_event_idx on public.notification_delivery_log(notification_event_id, created_at desc);
create index if not exists notification_delivery_log_recent_idx on public.notification_delivery_log(created_at desc);
create index if not exists notification_delivery_log_lookup_idx on public.notification_delivery_log(channel, resource, action, record_id, recipient_user_id, created_at desc);

alter table if exists public.push_subscriptions
  add column if not exists user_id uuid null,
  add column if not exists email text null,
  add column if not exists role text null,
  add column if not exists endpoint text,
  add column if not exists p256dh text,
  add column if not exists auth text,
  add column if not exists is_active boolean not null default true,
  add column if not exists user_agent text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists push_subscriptions_endpoint_unique_idx on public.push_subscriptions(endpoint) where endpoint is not null;
create index if not exists push_subscriptions_targets_idx on public.push_subscriptions(user_id, email, role) where is_active = true;

alter table public.notification_events enable row level security;
alter table public.notification_delivery_log enable row level security;

drop policy if exists notification_events_insert_authenticated on public.notification_events;
create policy notification_events_insert_authenticated on public.notification_events for insert to authenticated with check (true);
drop policy if exists notification_events_select_authenticated on public.notification_events;
create policy notification_events_select_authenticated on public.notification_events for select to authenticated using (true);

drop policy if exists notification_delivery_log_insert_authenticated on public.notification_delivery_log;
create policy notification_delivery_log_insert_authenticated on public.notification_delivery_log for insert to authenticated with check (true);
drop policy if exists notification_delivery_log_select_authenticated on public.notification_delivery_log;
create policy notification_delivery_log_select_authenticated on public.notification_delivery_log for select to authenticated using (true);

grant select, insert on public.notification_events to authenticated;
grant select, insert on public.notification_delivery_log to authenticated;

with defaults(resource, action, resource_label, action_label, description, title_template, body_template, deep_link_template, recipient_roles, users_from_record, recipient_mode, email_enabled) as (
  values
  ('tickets','ticket_created','Tickets','Ticket Created','A new ticket has been submitted.','New ticket {ticket_id}','{company_name} submitted {title}. Priority: {priority}.','/#tickets?ticket_id={ticket_id}',array['admin','dev'],array[]::text[],null,false),
  ('tickets','ticket_high_priority','Tickets','High Priority Ticket','A ticket is marked high priority.','High priority ticket {ticket_id}','{title} is marked {priority}.','/#tickets?ticket_id={ticket_id}',array['admin','dev'],array[]::text[],null,false),
  ('tickets','ticket_status_changed','Tickets','Ticket Status Changed','A ticket status changed.','Ticket {ticket_id} status changed','{old_status} → {new_status} for {title}.','/#tickets?ticket_id={ticket_id}',array['admin'],array['email_addressee','requester_email'],null,false),
  ('tickets','dev_team_status_changed','Tickets','Development Status Changed','Development-team status changed.','Development status changed for {ticket_id}','Development status: {dev_team_status}.','/#tickets?ticket_id={ticket_id}',array['admin','dev'],array[]::text[],null,false),
  ('tickets','ticket_under_development','Tickets','Ticket Under Development','Ticket moved into development.','Ticket under development {ticket_id}','{title} is now under development.','/#tickets?ticket_id={ticket_id}',array['dev'],array['email_addressee'],null,false),
  ('tickets','ticket_youtrack_changed','Tickets','YouTrack Changed','YouTrack reference changed.','YouTrack updated for {ticket_id}','YouTrack reference changed for {title}.','/#tickets?ticket_id={ticket_id}',array['dev'],array[]::text[],null,false),
  ('tickets','ticket_issue_related_changed','Tickets','Issue Related Changed','Issue-related flag changed.','Issue flag changed for {ticket_id}','Issue-related status changed for {title}.','/#tickets?ticket_id={ticket_id}',array['admin','dev'],array[]::text[],null,false),
  ('leads','lead_created','Leads','Lead Created','A new lead was created.','New lead: {company_name}','{actor_name} created a lead for {company_name}.','/#crm?tab=leads&id={record_id}',array['admin','sales_executive'],array['owner_email','created_by_email'],null,false),
  ('leads','lead_updated','Leads','Lead Updated','A lead was updated.','Lead updated: {company_name}','{actor_name} updated {company_name}.','/#crm?tab=leads&id={record_id}',array['admin','sales_executive'],array['owner_email'],null,false),
  ('leads','lead_converted_to_deal','Leads','Lead Converted','A lead was converted to a deal.','Lead converted: {company_name}','{company_name} was converted to a deal.','/#crm?tab=deals&id={record_id}',array['admin','sales_executive'],array['owner_email'],null,false),
  ('deals','deal_created','Deals','Deal Created','A new deal was created.','New deal: {company_name}','Deal created for {company_name}.','/#crm?tab=deals&id={record_id}',array['admin','sales_executive'],array['owner_email'],null,false),
  ('deals','deal_updated','Deals','Deal Updated','A deal was updated.','Deal updated: {company_name}','Deal details changed for {company_name}.','/#crm?tab=deals&id={record_id}',array['admin','sales_executive'],array['owner_email'],null,false),
  ('deals','deal_created_from_lead','Deals','Deal Created From Lead','A deal was created from a lead.','Deal created from lead','{company_name} is now a deal.','/#crm?tab=deals&id={record_id}',array['admin','sales_executive'],array['owner_email'],null,false),
  ('deals','deal_important_stage','Deals','Important Deal Stage','A deal reached an important stage.','Important deal stage: {status}','{company_name} reached {status}.','/#crm?tab=deals&id={record_id}',array['admin','sales_executive'],array['owner_email'],null,false),
  ('proposals','proposal_created','Proposals','Proposal Created','A proposal was created.','Proposal {proposal_number} created','Proposal for {company_name} was created.','/#crm?tab=proposals&id={record_id}',array['admin','sales_executive'],array['owner_email'],null,false),
  ('proposals','proposal_updated','Proposals','Proposal Updated','A proposal was updated.','Proposal {proposal_number} updated','Proposal for {company_name} was updated.','/#crm?tab=proposals&id={record_id}',array['admin','sales_executive'],array['owner_email'],null,false),
  ('proposals','proposal_requires_approval','Proposals','Requires Approval','A proposal requires approval.','Approval required: {proposal_number}','Proposal {proposal_number} requires approval.','/#workflow?approval_id={approval_id}',array['financial_controller','gm'],array[]::text[],null,true),
  ('proposals','proposal_approved','Proposals','Proposal Approved','A proposal was approved.','Proposal approved: {proposal_number}','Proposal {proposal_number} was approved.','/#crm?tab=proposals&id={record_id}',array['admin'],array['created_by_email','owner_email'],null,false),
  ('proposals','proposal_rejected','Proposals','Proposal Rejected','A proposal was rejected.','Proposal rejected: {proposal_number}','Proposal {proposal_number} was rejected.','/#crm?tab=proposals&id={record_id}',array['admin'],array['created_by_email','owner_email'],null,false),
  ('proposals','proposal_created_from_deal','Proposals','Proposal From Deal','A proposal was created from a deal.','Proposal created from deal','Proposal {proposal_number} was created.','/#crm?tab=proposals&id={record_id}',array['admin','sales_executive'],array['owner_email'],null,false),
  ('agreements','agreement_created','Agreements','Agreement Created','An agreement was created.','Agreement {agreement_number} created','Agreement for {company_name} was created.','/#crm?tab=agreements&id={record_id}',array['admin','accounting','hoo'],array['owner_email'],null,false),
  ('agreements','agreement_created_from_proposal','Agreements','Agreement From Proposal','Agreement created from proposal.','Agreement created from proposal','Agreement {agreement_number} was created.','/#crm?tab=agreements&id={record_id}',array['admin','accounting','hoo'],array['owner_email'],null,false),
  ('agreements','agreement_requires_signature','Agreements','Requires Signature','Agreement requires signature.','Signature required: {agreement_number}','Agreement {agreement_number} requires signature.','/#crm?tab=agreements&id={record_id}',array['admin','hoo'],array['client_email','owner_email'],null,true),
  ('agreements','agreement_signed','Agreements','Agreement Signed','Agreement was signed.','Agreement signed: {agreement_number}','Agreement {agreement_number} was signed.','/#crm?tab=agreements&id={record_id}',array['admin','accounting','hoo'],array['owner_email'],null,false),
  ('invoices','invoice_created','Invoices','Invoice Created','An invoice was created.','Invoice {invoice_number} created','Invoice for {company_name} was created.','/#finance?tab=invoices&id={record_id}',array['admin','accounting'],array['owner_email'],null,false),
  ('invoices','invoice_created_from_agreement','Invoices','Invoice From Agreement','Invoice created from agreement.','Invoice created from agreement','Invoice {invoice_number} was created.','/#finance?tab=invoices&id={record_id}',array['admin','accounting'],array['owner_email'],null,false),
  ('invoices','invoice_payment_updated','Invoices','Payment Updated','Invoice payment changed.','Payment updated: {invoice_number}','Payment status: {status}.','/#finance?tab=invoices&id={record_id}',array['admin','accounting'],array['owner_email'],null,false),
  ('invoices','invoice_fully_paid','Invoices','Fully Paid','Invoice is fully paid.','Invoice fully paid: {invoice_number}','Invoice {invoice_number} is fully paid.','/#finance?tab=invoices&id={record_id}',array['admin','accounting'],array['owner_email'],null,false),
  ('receipts','receipt_created','Receipts','Receipt Created','A receipt was created.','Receipt {receipt_number} created','Receipt for {company_name} was created.','/#finance?tab=receipts&id={record_id}',array['admin','accounting'],array['owner_email'],null,false),
  ('receipts','receipt_created_from_invoice','Receipts','Receipt From Invoice','Receipt created from invoice.','Receipt created from invoice','Receipt {receipt_number} was created.','/#finance?tab=receipts&id={record_id}',array['admin','accounting'],array['owner_email'],null,false),
  ('receipts','receipt_updated','Receipts','Receipt Updated','A receipt was updated.','Receipt {receipt_number} updated','Receipt details were updated.','/#finance?tab=receipts&id={record_id}',array['admin','accounting'],array['owner_email'],null,false),
  ('operations_onboarding','onboarding_created','Operations Onboarding','Onboarding Created','Onboarding item created.','Onboarding created: {client_name}','Onboarding started for {client_name}.','/#operations_onboarding?id={record_id}',array['admin','hoo'],array['assigned_csm_email','csm_email'],null,false),
  ('operations_onboarding','onboarding_status_changed','Operations Onboarding','Status Changed','Onboarding status changed.','Onboarding status changed','{client_name}: {old_status} → {new_status}.','/#operations_onboarding?id={record_id}',array['admin','hoo'],array['assigned_csm_email','csm_email'],null,false),
  ('operations_onboarding','onboarding_request_submitted','Operations Onboarding','Request Submitted','Onboarding request submitted.','Onboarding request submitted','A request was submitted for {client_name}.','/#operations_onboarding?id={record_id}',array['admin','hoo'],array['assigned_csm_email','csm_email'],null,false),
  ('operations_onboarding','assigned_csm','Operations Onboarding','Assigned CSM','CSM assignment changed.','You were assigned as CSM','{client_name} was assigned to you.','/#operations_onboarding?id={record_id}',array[]::text[],array['assigned_csm_email','csm_email'],null,false),
  ('technical_admin_requests','technical_request_submitted','Technical Admin Requests','Request Submitted','Technical admin request submitted.','Technical request submitted','{title} was submitted.','/#technical_admin_requests?id={record_id}',array['admin','dev','hoo'],array['requester_email','created_by_email'],null,false),
  ('technical_admin_requests','technical_request_status_changed','Technical Admin Requests','Status Changed','Technical admin request status changed.','Technical request status changed','{old_status} → {new_status} for {title}.','/#technical_admin_requests?id={record_id}',array['admin','dev','hoo'],array['requester_email'],null,false),
  ('events','event_created','Events','Event Created','Calendar event created.','Event created: {title}','{title} was scheduled.','/#events?id={record_id}',array['admin'],array['owner_email','created_by_email'],null,false),
  ('events','event_updated','Events','Event Updated','Calendar event updated.','Event updated: {title}','{title} was updated.','/#events?id={record_id}',array['admin'],array['owner_email','created_by_email'],null,false),
  ('events','event_status_changed','Events','Status Changed','Event status changed.','Event status changed: {title}','Status changed to {status}.','/#events?id={record_id}',array['admin'],array['owner_email'],null,false),
  ('events','event_schedule_changed','Events','Schedule Changed','Event schedule changed.','Event schedule changed: {title}','Schedule changed for {title}.','/#events?id={record_id}',array['admin'],array['owner_email'],null,false),
  ('events','event_deleted','Events','Event Deleted','Calendar event deleted.','Event deleted: {title}','{title} was deleted.','/#events?id={record_id}',array['admin'],array['owner_email'],null,false),
  ('workflow','workflow_approval_requested','Workflow','Approval Requested','Approval request created.','Approval requested','{title} requires approval.','/#workflow?approval_id={approval_id}',array['financial_controller','gm'],array[]::text[],null,true),
  ('workflow','workflow_approved','Workflow','Approved','Workflow approval approved.','Workflow approved','{title} was approved.','/#workflow?approval_id={approval_id}',array[]::text[],array['requester_email','created_by_email'],null,false),
  ('workflow','workflow_rejected','Workflow','Rejected','Workflow approval rejected.','Workflow rejected','{title} was rejected.','/#workflow?approval_id={approval_id}',array[]::text[],array['requester_email','created_by_email'],null,false),
  ('communication_centre','conversation_created','Communication Centre','Conversation Created','Conversation created.','New conversation: {conversation_title}','Conversation {conversation_no} was created.','/#communication_centre?conversation_id={record_id}',array[]::text[],array[]::text[],'participants_except_actor',false),
  ('communication_centre','reply_added','Communication Centre','Reply Added','Reply added to conversation.','New reply: {conversation_title}','{actor_name} replied in {conversation_no}.','/#communication_centre?conversation_id={record_id}',array[]::text[],array[]::text[],'participants_except_actor',false),
  ('communication_centre','conversation_closed','Communication Centre','Conversation Closed','Conversation closed.','Conversation closed: {conversation_title}','{conversation_no} was closed.','/#communication_centre?conversation_id={record_id}',array[]::text[],array[]::text[],'participants_except_actor',false),
  ('communication_centre','conversation_reopened','Communication Centre','Conversation Reopened','Conversation reopened.','Conversation reopened: {conversation_title}','{conversation_no} was reopened.','/#communication_centre?conversation_id={record_id}',array[]::text[],array[]::text[],'participants_except_actor',false),
  ('communication_centre','user_mentioned','Communication Centre','User Mentioned','User mentioned in conversation.','You were mentioned: {conversation_title}','{actor_name} mentioned you in {conversation_no}.','/#communication_centre?conversation_id={record_id}',array[]::text[],array['mentioned_user_email'],null,false),
  ('communication_centre','role_mentioned','Communication Centre','Role Mentioned','Role mentioned in conversation.','Your role was mentioned: {conversation_title}','{actor_name} mentioned your role in {conversation_no}.','/#communication_centre?conversation_id={record_id}',array[]::text[],array[]::text[],'assigned_role_snapshot_except_actor',false)
)
insert into public.notification_rules(resource, action, resource_label, action_label, description, title_template, body_template, deep_link_template, recipient_roles, users_from_record, recipient_mode, email_enabled, is_enabled, in_app_enabled, pwa_enabled, exclude_actor, dedupe_window_seconds)
select resource, action, resource_label, action_label, description, title_template, body_template, deep_link_template, recipient_roles, users_from_record, recipient_mode, email_enabled, true, true, true, true, 60
from defaults
on conflict (resource, action) do update set
  resource_label = coalesce(public.notification_rules.resource_label, excluded.resource_label),
  action_label = coalesce(public.notification_rules.action_label, excluded.action_label),
  description = case when coalesce(public.notification_rules.description,'') = '' then excluded.description else public.notification_rules.description end,
  title_template = coalesce(public.notification_rules.title_template, excluded.title_template),
  body_template = coalesce(public.notification_rules.body_template, excluded.body_template),
  deep_link_template = coalesce(public.notification_rules.deep_link_template, excluded.deep_link_template),
  updated_at = timezone('utc', now());
