# Decimal License Months

The commercial forms now accept fractional License / Month values from `0.01` to `12`, including `0.25`, `0.50`, and `0.75`.

Updated areas:
- Proposal annual SaaS rows
- Agreement annual SaaS rows
- Invoice annual SaaS rows
- Receipt and document views preserve the invoice item's decimal quantity
- Fractional service-end-date calculation remains enabled

Run `20260731_decimal_license_months.sql` once in Supabase so relevant database columns accept decimals and old minimum-1 checks do not block saving.
