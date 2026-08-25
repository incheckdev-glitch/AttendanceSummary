create or replace function public.preserve_proposal_status_on_blank_update()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.status is not null and btrim(new.status) = '' then
    if tg_op = 'INSERT' then
      new.status := 'draft';
    else
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists aaa_preserve_proposal_status_on_blank_update on public.proposals;
create trigger aaa_preserve_proposal_status_on_blank_update
before insert or update of status on public.proposals
for each row
execute function public.preserve_proposal_status_on_blank_update();
