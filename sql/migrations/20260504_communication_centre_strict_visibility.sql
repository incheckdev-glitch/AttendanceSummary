-- Enforce strict Communication Centre visibility using snapshot participants only.

alter table if exists public.communication_centre_conversations enable row level security;
alter table if exists public.communication_centre_participants enable row level security;

-- Conversations: every role sees only created_by or explicit participant rows.
drop policy if exists communication_centre_conversations_select_access on public.communication_centre_conversations;
create policy communication_centre_conversations_select_access
on public.communication_centre_conversations
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.communication_centre_participants ccp
    where ccp.conversation_id = communication_centre_conversations.id
      and ccp.user_id = auth.uid()
  )
);

-- Participants: only visible for conversations the requester can access.
drop policy if exists communication_centre_participants_select_access on public.communication_centre_participants;
create policy communication_centre_participants_select_access
on public.communication_centre_participants
for select
to authenticated
using (
  exists (
    select 1
    from public.communication_centre_conversations c
    where c.id = communication_centre_participants.conversation_id
      and (
        c.created_by = auth.uid()
        or exists (
          select 1
          from public.communication_centre_participants ccp
          where ccp.conversation_id = c.id
            and ccp.user_id = auth.uid()
        )
      )
  )
);
