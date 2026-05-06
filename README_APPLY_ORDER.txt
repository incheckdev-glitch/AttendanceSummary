Communication Centre PWA Real Final Fix

Problem fixed:
- In-app notification works, but PWA push does not show for Communication Centre.
- Root cause: Communication Centre returned notification recipients, but the PWA function could not always match those recipients to rows in push_subscriptions because IDs can differ between profiles/auth/users. This fix sends user IDs + emails + roles from the frontend and makes send-web-push-v2 resolve subscriptions using all common ID/email/role aliases.

Apply order:
1) Replace communication-centre.js in the frontend root.
2) Replace supabase/functions/send-web-push-v2/index.ts.
3) Redeploy the Supabase Edge Function send-web-push-v2.
4) Deploy frontend to Vercel.
5) Only run CommunicationCentre_PWA_REAL_FINAL_SQL_IF_NOT_ALREADY_APPLIED.sql if you did not already apply the previous Notification + Edit final SQL. If in-app notifications are already working, SQL is probably already okay.

Important test:
- Test using two different users/devices. The actor/sender is excluded from push notification targets.
- The receiving user must have PWA push enabled and an active row in public.push_subscriptions.

Verification after a new Communication Centre reply:
select *
from public.push_notification_log
order by created_at desc
limit 10;

Expected:
- payload->>'resource' or payload.data.resource should be communication_centre
- attempted > 0
- sent > 0

If the row shows attempted = 0 or error = No active push subscriptions found:
select id, user_id, email, role, is_active, created_at, last_seen_at
from public.push_subscriptions
where is_active = true
order by created_at desc
limit 50;

Then confirm the receiving user has an active subscription.
