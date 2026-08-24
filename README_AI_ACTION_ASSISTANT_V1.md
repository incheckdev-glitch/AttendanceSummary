# InCheck360 AI Action Assistant V1

## What this version does

The AI Assistant is an admin-only natural-language command layer for the ERP.

- Reads ERP records through the Supabase Edge Function.
- Uses OpenAI Responses API function tools to understand requests and plan ERP actions.
- Never gives OpenAI direct database-write access.
- Returns proposed actions to the browser.
- The browser validates the action against a local allowlist and current ERP permissions.
- The browser executes approved actions through `Api.requestWithSession(...)`, preserving the existing Supabase/RLS/RPC/business-rule path.
- Financial, legal, destructive, approval, and other high-risk actions require an explicit confirmation dialog.
- Stores AI chat text encrypted at rest using AES-GCM.
- Records planned/executed actions in `public.ai_action_audit`.
- Supports sequential multi-step requests, executing one controlled action at a time and re-checking the real ERP result before the next step.
- Stops after 8 action steps in one command to prevent accidental loops.
- Excludes users, roles, role permissions, authentication, secrets, RLS, API keys, and arbitrary SQL from AI execution.

## Files changed

- `ai-assistant.js`
- `index.html`
- `ui.js`
- `permissions.js`
- `app.js`
- `styles.css`
- `service-worker.js`
- `supabase/functions/incheck360-ai-assistant/index.ts`
- `sql/migrations/20260824_ai_action_assistant_v1.sql`

## Required deployment configuration

Apply the SQL migration first, then configure the Edge Function secrets:

- `OPENAI_API_KEY` — required.
- `AI_CHAT_ENCRYPTION_KEY` — required. Use a strong random 32-byte secret (base64 is supported).
- `OPENAI_MODEL` — optional. Defaults to `gpt-5.6-luna` (current cost-sensitive GPT-5.6 tier).

The standard Supabase Edge Function environment values `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are also required by the function.

Deploy the Edge Function named `incheck360-ai-assistant`, then deploy the frontend.

## Security model

V1 is deliberately admin-only. The Edge Function verifies the bearer JWT with Supabase Auth and resolves the role server-side from `profiles.role_key` (falling back to trusted app metadata). Browser-supplied role values are not trusted.

The Edge Function's service-role client is used only for assistant read tools and its private chat/audit tables. It does not perform ERP business writes. All ERP writes are sent back to the authenticated frontend and executed through the existing ERP action dispatcher.

Do not broaden AI Assistant access beyond admin until the Edge Function read path has been converted to a user-scoped Supabase client that enforces each role's RLS policies.

## Example commands

- `Show overdue payments.`
- `Summarize Agreement#00120.`
- `Create an invoice from Agreement#00120.`
- `Mark Proposal#00058 as accepted.`
- `Create a receipt for USD 550.63 from SA/2026/72.`
- `Show all signed agreements that have not been invoiced.`
- `Create a lead for Acme and set the follow-up for tomorrow.`

For requests that are missing required information, the assistant should ask for the missing value instead of guessing.
