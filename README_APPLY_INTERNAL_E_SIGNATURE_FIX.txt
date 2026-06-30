Agreement Internal E-Signature Fix

This update fixes the ERP internal signing buttons for agreements.

What changed:
- Shows Provider / Internal Signatures section after the customer signs the public E-Agreement.
- Supports status values accepted, awaiting_provider_signature, awaiting_internal_signature, and signed.
- Shows Sign as SFC first.
- GM button stays disabled until SFC signs.
- After GM signs, agreement status becomes signed.
- Admin is allowed to sign as SFC/GM override in frontend logic.
- Adds/updates SQL objects for agreement_internal_signatures and agreement_internal_sign RPC.

Apply order:
1. Replace these frontend files:
   - agreements.js
   - styles.css
   - index.html

2. Run this SQL in Supabase SQL Editor:
   - sql/20260630_AGREEMENT_INTERNAL_ESIGN_COMPLETE_FIX.sql

3. Run:
   notify pgrst, 'reload schema';

4. Redeploy frontend/Vercel.

5. Test:
   - Customer signs public E-Agreement.
   - Open the Agreement inside ERP.
   - Provider / Internal Signatures should appear.
   - SFC signs first.
   - GM signs last.
   - Status becomes signed only after GM signs.
