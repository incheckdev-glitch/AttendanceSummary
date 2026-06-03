-- Invoice payment schedule reminder settings, notification rule, and daily cron hook.
-- Safe additive migration for environments where the columns/tables already exist.

alter table if exists public.invoice_payment_schedule
  add column if not exists reminder_enabled boolean not null default false,
  add column if not exists reminder_days integer[] not null default array[30,14,7],
  add column if not exists reminder_user_ids uuid[] not null default array[]::uuid[],
  add column if not exists reminder_note text null,
  add column if not exists reminder_updated_at timestamptz null,
  add column if not exists reminder_updated_by uuid null references public.profiles(id) on delete set null;

create table if not exists public.invoice_payment_schedule_reminder_log (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.invoice_payment_schedule(id) on delete cascade,
  reminder_day integer not null check (reminder_day in (30,14,7)),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid null,
  sent_at timestamptz not null default timezone('utc', now()),
  status text not null default 'processed',
  error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (schedule_id, reminder_day, recipient_user_id)
);

create index if not exists invoice_payment_schedule_reminders_due_idx
  on public.invoice_payment_schedule (reminder_enabled, due_date)
  where reminder_enabled = true and due_date is not null;

create index if not exists invoice_payment_schedule_reminder_log_lookup_idx
  on public.invoice_payment_schedule_reminder_log (schedule_id, reminder_day, recipient_user_id);

insert into public.notification_rules(
  resource,
  action,
  resource_label,
  action_label,
  description,
  title_template,
  body_template,
  deep_link_template,
  recipient_user_ids,
  recipient_roles,
  users_from_record,
  email_enabled,
  is_enabled,
  in_app_enabled,
  pwa_enabled,
  exclude_actor,
  dedupe_window_seconds
)
values (
  'invoice_payment_schedule',
  'payment_due_reminder',
  'Invoice Payment Schedule',
  'Payment Due Reminder',
  'Notify selected users 30, 14, or 7 days before an invoice payment schedule due date.',
  'Scheduled Payment Due in {{days_until_due}} Days · {{invoice_number}}',
  'Payment {{schedule_label}} for invoice {{invoice_number}} is due on {{due_date}}. Scheduled amount: {{scheduled_amount}} {{currency}}. Balance due: {{balance_due}} {{currency}}.',
  '#invoices?invoice_id={{invoice_id}}',
  array[]::uuid[],
  array[]::text[],
  array[]::text[],
  false,
  true,
  true,
  true,
  false,
  86400
)
on conflict (resource, action) do update set
  resource_label = coalesce(public.notification_rules.resource_label, excluded.resource_label),
  action_label = coalesce(public.notification_rules.action_label, excluded.action_label),
  description = case when coalesce(public.notification_rules.description, '') = '' then excluded.description else public.notification_rules.description end,
  title_template = coalesce(nullif(public.notification_rules.title_template, ''), excluded.title_template),
  body_template = coalesce(nullif(public.notification_rules.body_template, ''), excluded.body_template),
  deep_link_template = coalesce(nullif(public.notification_rules.deep_link_template, ''), excluded.deep_link_template),
  in_app_enabled = coalesce(public.notification_rules.in_app_enabled, true),
  pwa_enabled = coalesce(public.notification_rules.pwa_enabled, true),
  updated_at = timezone('utc', now());

-- Optional Supabase pg_cron hook. Requires pg_net/http extension and project URL/secrets to be configured.
-- The Edge Function also self-guards so invocations outside 08:00 local time are skipped unless force=true.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('process-payment-schedule-reminders-daily');
    perform cron.schedule(
      'process-payment-schedule-reminders-daily',
      '0 8 * * *',
      $cron$select net.http_post(
          url := current_setting('app.supabase_url', true) || '/functions/v1/process-payment-schedule-reminders',
          headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true), 'Content-Type', 'application/json'),
          body := '{}'::jsonb
        );$cron$
    );
  end if;
exception when others then
  raise notice 'Skipping payment schedule reminder cron setup: %', sqlerrm;
end $$;
