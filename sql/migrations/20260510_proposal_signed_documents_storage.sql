-- Store signed proposal documents in a private Supabase Storage bucket.

alter table if exists public.proposals
  add column if not exists signed_document_path text,
  add column if not exists signed_document_name text,
  add column if not exists signed_document_uploaded_at timestamptz,
  add column if not exists signed_document_uploaded_by uuid;

insert into storage.buckets (id, name, public)
values ('proposal-signed-documents', 'proposal-signed-documents', false)
on conflict (id) do update
set public = false;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload signed proposal documents'
  ) then
    create policy "Authenticated users can upload signed proposal documents"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'proposal-signed-documents'
      and name like 'proposals/%'
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update signed proposal documents'
  ) then
    create policy "Authenticated users can update signed proposal documents"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'proposal-signed-documents'
      and name like 'proposals/%'
    )
    with check (
      bucket_id = 'proposal-signed-documents'
      and name like 'proposals/%'
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can read signed proposal documents'
  ) then
    create policy "Authenticated users can read signed proposal documents"
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'proposal-signed-documents'
      and name like 'proposals/%'
    );
  end if;
end
$$;
