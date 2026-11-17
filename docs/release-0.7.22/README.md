# SendRack 0.7.22-fcm — notification recovery

This release handles notification reliability before continuing the reference-based interface redesign. The existing vendor/rider interface and delivery/payment/identity safeguards remain in this APK.

## Reproduced and corrected failures

A shipment created before the rider chose today's route produced no notification. Saving the route did not recover that notification until a subsequent dispatch/inbox request. A failing regression reproduced zero notification rows after selection; it now passes with one alert and one controlled provider send. Route selection now recovers matching open shipments and wakes the sender. Successful device registration also repairs missing matching inbox entries. Unsent alerts previously classified obsolete can be reconsidered after eligibility returns, with eligibility checked again before sending. Already successful sends are not replayed by this recovery.

A changed admin route revision blocked offers but the daily route response still said the rider was confirmed and available. That response now requires renewed confirmation. A lightweight foreground check detects changes and day rollover; it only redraws Home when the route dialog must appear, preserving normal polling stability.

A Firebase token failure originally updated the activity status but did not schedule a background token-acquisition retry. The registration worker now obtains a missing token with a bounded wait and retries using WorkManager, including after the activity closes. Android compilation passed; background OS execution still requires a physical phone test.

Owner → Delivery setup additionally distinguishes riders with current working routes, inbox alerts created in the last 24 hours, queued sends, FCM acceptance and sanitized provider error codes. These are operational diagnostics, not proof a phone displayed an alert.

## Installation and live verification

Deploy the merged apk-test-v0.7.0 commit to the existing Render service. The runtime /api/version features.notificationRouteRecovery flag should be true. Keep the existing database, Firebase server configuration and hosting plan.

Install downloads/SendRack-0.7.22-fcm.apk over ng.sendrack.test without uninstalling or clearing data. Sign in as a rider, allow Android notifications, and select today's matching route (or update it in Profile). On another phone sign in as a vendor and create a shipment for that route, pickup city, state and vehicle. The rider must satisfy existing identity/capacity restrictions. Existing test-dispatch mode allows acceptance without payment only for eligible test shipments; no live funding safeguards changed.

Test with the rider app in the background, without Android Force stop. Confirm a real device alert and that tapping it opens the authenticated delivery offer; accept, navigate, call and collect. Check Delivery setup counters if an alert does not arrive. A provider acceptance is not device receipt.

## Evidence and limits

99 PostgreSQL server/API tests passed, without skips. Tests cover recovery on route selection, stale same-day route declarations, eligibility suppression, reactivation without duplicate sends, authentication, signing-bound push messages and other delivery regressions. Browser tests passed for notification login/deep links, same-day route revision recovery, daily/regional access and quiet polling. Extracted signed-APK checks passed for current assets, vendor/rider screens, map-origin handling, two-session create/accept/call/collect and pickup safeguards. These are controlled browser tests, not physical Android execution. No live FCM send, physical-phone receipt or Render deployment is claimed: this workspace has no Render credentials and its host policy blocks Render access.

Package ng.sendrack.test; version code 22; version 0.7.22-fcm. The supplied Android Firebase file matches project sendrack-fcbe5. The retained private signing key was used; no replacement key was generated. Verified signer SHA-256: d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5. APK checksum is in downloads/SendRack-0.7.22-fcm.apk.sha256.
