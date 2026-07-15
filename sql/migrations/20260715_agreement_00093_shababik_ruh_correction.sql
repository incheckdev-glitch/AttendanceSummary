-- One-time correction for Agreement#00093 Annual SaaS item.
-- Scope is intentionally limited to the Shababik RUH location row.

do $$
declare
  v_agreement_id uuid;
  v_updated_count integer;
begin
  select a.id
    into v_agreement_id
  from public.agreements a
  where lower(trim(coalesce(a.agreement_id, ''))) in ('agreement#00093', '00093')
     or lower(trim(coalesce(a.agreement_number, ''))) in ('agreement#00093', '00093')
  order by a.updated_at desc nulls last, a.created_at desc nulls last
  limit 1;

  if v_agreement_id is null then
    raise exception 'Agreement#00093 was not found. Shababik RUH correction was not applied.';
  end if;

  update public.agreement_items ai
     set quantity = 0.10,
         service_start_date = date '2026-07-01',
         service_end_date = date '2026-07-31',
         discount_percent = 0,
         line_total = 6.88,
         discounted_unit_price = 6.88,
         updated_at = now()
   where ai.agreement_id = v_agreement_id
     and lower(trim(coalesce(ai.location_name, ''))) = 'shababik ruh'
     and lower(trim(coalesce(ai.section, ''))) in ('annual_saas', 'annual saas');

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception 'Expected to update exactly one Agreement#00093 Shababik RUH Annual SaaS item, updated %.', v_updated_count;
  end if;

  update public.agreements a
     set subtotal_locations = totals.subtotal_locations,
         saas_total = totals.subtotal_locations,
         subtotal_one_time = totals.subtotal_one_time,
         one_time_total = totals.subtotal_one_time,
         grand_total = totals.grand_total,
         updated_at = now()
    from (
      select ai.agreement_id,
             round(coalesce(sum(case
               when lower(trim(coalesce(ai.section, ''))) in ('annual_saas', 'annual saas') then coalesce(ai.line_total, 0)
               else 0
             end), 0)::numeric, 2) as subtotal_locations,
             round(coalesce(sum(case
               when lower(trim(coalesce(ai.section, ''))) in ('one_time_fee', 'one time fee', 'one-time fees', 'hardware') then coalesce(ai.line_total, 0)
               else 0
             end), 0)::numeric, 2) as subtotal_one_time,
             round(coalesce(sum(case
               when lower(trim(coalesce(ai.section, ''))) in ('annual_saas', 'annual saas', 'one_time_fee', 'one time fee', 'one-time fees', 'hardware') then coalesce(ai.line_total, 0)
               else 0
             end), 0)::numeric, 2) as grand_total
        from public.agreement_items ai
       where ai.agreement_id = v_agreement_id
       group by ai.agreement_id
    ) totals
   where a.id = totals.agreement_id;
end $$;
