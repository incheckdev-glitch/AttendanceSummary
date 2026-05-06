Communication Centre final fix apply order:

1. Run CommunicationCentre_SEND_NAME_PWA_FINAL_FIX.sql in Supabase SQL editor.
2. Replace communication-centre.js in your frontend.
3. Keep/replace supabase/functions/send-web-push-v2/index.ts with the fixed version if you did not already apply the previous PWA push ZIP.
4. Redeploy frontend to Vercel.
5. Redeploy the Supabase Edge Function send-web-push-v2 only if you replaced it.
6. Hard refresh browser/PWA and send a new Communication Centre reply.

This fix keeps real sender names, restores reliable sending after encryption changes, and keeps direct PWA push non-blocking.
