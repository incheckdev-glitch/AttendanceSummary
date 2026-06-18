alter table public.notification_delivery_queue
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text;

create index if not exists notification_delivery_queue_locked_idx
  on public.notification_delivery_queue(status, locked_at, locked_by);
