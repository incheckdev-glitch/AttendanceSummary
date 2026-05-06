Communication Centre notification + edit final fix

Apply in this order:

1. Run CommunicationCentre_NOTIFICATION_AND_EDIT_FINAL_FIX.sql in Supabase SQL Editor.

2. Replace frontend file:
   communication-centre.js

3. Replace Supabase Edge Function file only if your send-web-push-v2 function is older than the attached file:
   send-web-push-v2.index.ts
   Destination path:
   supabase/functions/send-web-push-v2/index.ts

4. Deploy frontend to Vercel.

5. If you replaced the Edge Function, redeploy Supabase Edge Function send-web-push-v2.

Test:
- Send a new Communication Centre reply from User A to a conversation where User B is participant.
- Edit one of User A's own messages.

Check in Supabase:
select notification_id, recipient_user_id, title, resource, resource_id, created_at
from public.notifications
where resource = 'communication_centre'
order by created_at desc
limit 10;

select *
from public.push_notification_log
order by created_at desc
limit 10;

Expected:
- public.notifications has communication_centre rows.
- public.push_notification_log has rows with attempted > 0 and sent > 0 when the target user has an active PWA subscription.
