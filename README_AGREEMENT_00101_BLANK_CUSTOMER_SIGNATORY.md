# Agreement#00101 blank customer signatory correction

## Database correction

Run `sql/migrations/20260730_agreement_00101_clear_customer_signature_contact.sql` as the database owner. The migration:

- resolves exactly one row by the deployed `agreement_number` / `agreement_id` values;
- queries `information_schema.columns` before building the update, rather than assuming historical aliases exist;
- clears only customer contact and customer signatory columns that actually exist;
- bypasses the application lock as an owner-run administrative correction without changing status;
- snapshots and compares every existing provider-signatory column, rolling back on any provider change; and
- fails closed unless exactly one Agreement#00101 row is found and updated.

The verification query at the end returns `exactly_one_target = true`, `all_customer_fields_empty = true`, and an empty `remaining_values` object when the correction succeeded.

## Application and document behavior

`agreements.js` recognizes only Agreement#00101 (in addition to the two pre-existing administrative exceptions) as a full customer contact/signature redaction. Redaction is applied during normalization and again while building the shared preview HTML, which is also the source used for browser print and generated PDF output. This prevents refreshed or regenerated documents from hydrating the empty values from linked contact/company records. Provider signatories and all commercial, lifecycle, date, item, and client/company data remain unchanged.

## Deployment

1. Apply the SQL migration as the database owner.
2. Deploy `agreements.js` and `index.html`.
3. Hard-refresh the application and reopen Agreement#00101.
4. Run the verification query included at the bottom of the migration.
5. Check the web preview, browser print preview, and a newly generated PDF.
