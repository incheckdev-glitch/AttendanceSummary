-- Add a stable request key so retrying a Credit Note create request returns one record.
alter table public.credit_notes
  add column if not exists credit_note_request_key text;

create unique index if not exists credit_notes_request_key_unique
  on public.credit_notes (credit_note_request_key)
  where credit_note_request_key is not null;
