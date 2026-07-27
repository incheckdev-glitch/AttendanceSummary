# 360 Analytics Phase Duration & Notes Fix — V22

## Fixed

- Phase durations are now calculated from one linked lifecycle chain instead of mixing unrelated lead, deal, proposal, agreement, invoice, and receipt records belonging to the same company.
- The chain follows actual record relationships (`lead → deal → proposal → agreement → invoice → receipt`) and falls back to the next chronological record only when a direct link is unavailable.
- Every duration card now displays the record reference and the exact start/end timestamps used in the calculation.
- Lead and Deal note-history tables are loaded into 360 Analytics and displayed in each phase's **View History** drawer.
- Notes stored on Proposal, Agreement, Invoice, Receipt, and other source records are shown as a safe **Record note** history item when no matching history log already contains that note.
- Future status changes now carry available notes/change reasons into `lifecycle_status_logs`.
- When both the database trigger and browser fallback log the same transition, the existing row is enriched with notes instead of leaving the note blank.

## Files

- `lifecycle-analytics.js`
- `supabase-data.js`
- `index.html`
- `20260727_360_analytics_phase_duration_notes_fix.sql`

## Installation

1. Run `20260727_360_analytics_phase_duration_notes_fix.sql` in Supabase SQL Editor.
2. Replace `lifecycle-analytics.js`, `supabase-data.js`, and `index.html`.
3. Redeploy the application.
4. Sign out and back in, then press **Ctrl + Shift + R**.

## Validation

- JavaScript syntax validation passed.
- SQL migration safety validation passed.
- All 37 ERP regression tests passed.
- Primary-chain duration and phase-note runtime checks passed.
