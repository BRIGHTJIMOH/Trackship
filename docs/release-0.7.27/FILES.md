# Complete replacement files

The source ZIP preserves these exact paths. Each source file is included in full; `changes.patch` is also provided for review against the previous release. Changes are already applied in the repository. Do not replace the project with a NestJS/Expo template.

| File | Correction |
| --- | --- |
| `.env.example` | Correct the obsolete claim that the released APK has no FCM support. No secret values are included. |
| `admin/app.js` | Show the Firebase project and separate vendor/rider device counts. |
| `android/AndroidManifest.xml` | Declare normal vibration permission for the shared notification implementation. |
| `android/firebase/src/main/AndroidManifest.xml` | Include vibration permission in the Firebase release. |
| `android/firebase/build.gradle` | Release version 0.7.27, code 27. |
| `android/src/ng/trackship/app/MainActivity.java` | Role-aware native notification configuration, durable cold/warm tap destination, and actionable Android settings for denied permissions. |
| `android/src/ng/trackship/app/DeliveryAlerts.java` | High-importance audible/vibrating channel, blocked-category checks, role-aware pending intents. Existing user channel choices remain authoritative. |
| `android/src/ng/trackship/app/DeliveryAlertJob.java` | Use the authenticated active role's inbox for the OS-scheduled fallback. This remains a delayed fallback, not instant FCM. |
| `android/firebase/src/main/java/ng/trackship/app/FirebaseDeliveryPush.java` | Report blocked notification categories clearly. |
| `android/firebase/src/main/java/ng/trackship/app/PushRegistrationWorker.java` | Register the active role and rotate a server-rejected Firebase token automatically. |
| `android/firebase/src/main/java/ng/trackship/app/SendrackMessagingService.java` | Check the recipient role as well as the session binding before displaying an FCM update. |
| `scripts/build-firebase-apk.sh` | Produce version 0.7.27 with the same certificate validation and private existing key. |
| `server/server.mjs` | Apply the registration rate limit to both vendor and rider push routes. |
| `server/operations.mjs` | Persist lifecycle alerts with shipment writes; wire vendor push/inbox authorization; revoke both roles' installations on logout; distinguish bad delivery OTP from bad authentication. |
| `server/market.mjs` | Keep rider inboxes role-scoped and allow relevant assigned-participant updates after initial acceptance. Offer matching safeguards remain intact. |
| `server/delivery-contacts.mjs` | Authorize recipient contacts only during the assigned final/intrastate carrying stage; return the server-selected current contact. |
| `server/delivery-readiness.mjs` | Report Firebase project and vendor device count separately from rider count. |
| `server/push/delivery-push.mjs` | Additive role migration; role-bound registration, queue claims and retries; token-rotation request; stale-result guard; sanitized failure logs. |
| `server/push/fcm.mjs` | Include recipient role, expose non-secret target project for diagnostics, and retain safe FCM failure codes. |
| `server/push/principals.mjs` | Shared role-scoped active-session query; no cross-role token lookup. |
| `server/push/lifecycle-notifications.mjs` | Record actual event alerts for assigned riders and the owning vendor transactionally and idempotently. |
| `server/push/vendor-notifications.mjs` | Verified vendor-session authentication, owner-filtered inbox and scoped read updates. |
| `web/app.js` | Authenticate safely against older servers; distinguish business 401s from expired sessions; preserve the tapped account role; simplify tracking and update vendor notification views after sync. |
| `web/features.mjs` | Configure push for either role, poll vendor updates quietly, show notification settings, select/revalidate the current contact, and remove tracking's viewer/pickup setup controls. |
| `web/style.css` | Compact tracking reference link and rounded single-contact strip. |
| `tests/account-push-ui.mjs` | Vendor native-bridge registration, cold/warm routing, foreground updates and logout checks. |
| `tests/push-notification-ui.mjs` | Cold-start rider routing, older-backend authenticated fallback and notification settings states. |
| `tests/push.test.mjs` | Vendor/rider isolation, token rotation, late-result protection, invalid token recovery and safe logging. |
| `tests/delivery-contacts.test.mjs` | Recipient contact after collection with assignment/privacy safeguards. |
| `tests/workflow.test.mjs` | All-leg lifecycle alerts and bad-OTP validation without reducing attempt limits. |
| `tests/session-home-ui.mjs` | Old-server rejection of invalid sessions and preservation of valid sessions on business-code errors. |
| `tests/mobile-map-origin-ui.mjs` | Correct API origin/provider behavior and no viewer-location controls or substitute GPS on tracking. |
| `tests/reference-redesign-ui.mjs` | Minimal tracking, current contact strip, recipient call/message transition and responsive checks. |
| `tests/viewer-apk-assets.mjs` | Exact APK/source hash checks and compiled native role/token-recovery markers. |
| `tests/test-apk-current.mjs` | Run the expanded checks against version 0.7.27. |

The legacy database column named `rider_id` is retained to avoid destructive migration. For push installations and notifications, its principal is now explicitly namespaced by `account_role`. Both claim/read paths enforce role, account identity and live session. Existing rows default to rider. No customer contacts or credentials are added to FCM payloads.

The ZIP also includes the release guide and controlled-test screenshots. The signed APK and its checksum are separate downloads. Private Firebase configurations, signing material, generated build folders and dependencies are excluded.
