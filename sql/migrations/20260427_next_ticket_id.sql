create or replace function public.next_ticket_id()
returns text
language plpgsql
security definer
as $$
declare
  next_num integer;
  next_id text;
begin
  select coalesce(
    max(
      nullif(
        regexp_replace(ticket_id, '\\D', '', 'g'),
        ''
      )::integer
    ),
    0
  ) + 1
  into next_num
  from public.tickets
  where ticket_id is not null;

  loop
    next_id := 'TICKET-' || lpad(next_num::text, 4, '0');

    if not exists (
      select 1
      from public.tickets
      where ticket_id = next_id
    ) then
      return next_id;
    end if;

    next_num := next_num + 1;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
