# Admin Proposal Override Save Fix

Apply the files in this package in this order:

1. Run `sql/migrations/20260804_admin_locked_proposal_override_v2.sql` in the Supabase SQL Editor.
2. Deploy the updated `proposals.js`.
3. Hard-refresh the application and sign in again as Admin.

The migration removes old RPC overloads, recreates the exact PostgREST function signature, reloads the schema cache, supports both nested and flat proposal payloads, updates proposal items transactionally, and writes an audit record.

The frontend update preserves the selected proposal status during Admin Override and sends a backward-compatible payload so accepted proposals are not silently changed back to Expired.
