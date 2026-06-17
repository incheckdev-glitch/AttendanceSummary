Fix: Notification Setup test / Biners notification where email was sent but in-app and PWA were not created.

Updated files:
- supabase-data.js
- notification-service.js
- notification-settings.js
- notification-template-helpers.js
- index.html

Main changes:
1. Test Notification now targets the current user explicitly for in-app and PWA tests, and does not exclude the tester as actor.
2. In-app notification creation now creates hub rows per resolved target user, instead of relying only on target roles.
3. PWA push can be attempted using resolved user IDs, emails, or role aliases.
4. Biners route is added to notification link resolution.
5. Notification Setup test toast now shows created/sent/skipped details for in-app, PWA, and email.

After replacing files:
- Hard refresh browser.
- Reopen Notification Setup.
- Test Biners > New Biners Entry Created.
- For PWA: user must have push permission granted and an active PWA subscription.
