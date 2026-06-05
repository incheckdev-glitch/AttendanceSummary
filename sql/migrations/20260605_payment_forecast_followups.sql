-- Collection follow-up tracking for scheduled receivables.
create table if not exists public.payment_forecast_followups (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid,
  invoice_number text,
  schedule_no integer,
  client_name text,
  follow_up_status text not null default 'not_started' check (follow_up_status in ('not_started','contacted','promised_to_pay','disputed','escalated','closed')),
  last_follow_up_at timestamptz,
  next_follow_up_at timestamptz,
  follow_up_notes text,
  assigned_to uuid,
  assigned_to_email text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_forecast_followups_invoice_schedule_uidx on public.payment_forecast_followups (invoice_id, schedule_no) where invoice_id is not null;
create index if not exists payment_forecast_followups_status_idx on public.payment_forecast_followups (follow_up_status, next_follow_up_at);
alter table public.payment_forecast_followups enable row level security;
drop policy if exists "authenticated users can view payment forecast followups" on public.payment_forecast_followups;
create policy "authenticated users can view payment forecast followups" on public.payment_forecast_followups for select to authenticated using (lower(coalesce(public.current_app_role(), '')) in ('admin','accounting','accountant','senior_financial_controller','senior_fc','sfc','general_manager','gm'));
drop policy if exists "authenticated users can manage payment forecast followups" on public.payment_forecast_followups;
create policy "authenticated users can manage payment forecast followups" on public.payment_forecast_followups for all to authenticated using (lower(coalesce(public.current_app_role(), '')) in ('admin','accounting','accountant','senior_financial_controller','senior_fc','sfc','general_manager','gm')) with check (lower(coalesce(public.current_app_role(), '')) in ('admin','accounting','accountant','senior_financial_controller','senior_fc','sfc','general_manager','gm'));
grant select, insert, update, delete on public.payment_forecast_followups to authenticated;
