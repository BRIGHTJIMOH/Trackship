# Reaction alerts — Android 0.7.48

A changed shipment reaction creates one durable notification for the other party: vendor/tracking viewer to the current handler, handler to the vendor. Identical retries create no extra notification. Existing reaction cooldown and rate limits remain in force.

The recipient sees a compact banner while signed in on any app screen. Android's Delivery alerts category provides notification sound, vibration, heads-up display and notification-tray access when permitted by the phone's settings. Tapping opens the exact shipment after the appropriate account's PIN login. Sound/lock-screen display cannot override muted categories, Do Not Disturb, offline state, force-stop or OS delivery delays.

FCM still carries only opaque event references and session bindings. The Android service retrieves the matching notification through an authenticated event endpoint before displaying sender/emoji. It checks the account binding again before display and on tap. Customer addresses, phone numbers and dispatch tokens are not added to push payloads or history-detail responses.

Reactions and their notifications commit together. The existing durable push worker retries provider failures. Pending reaction pushes become obsolete after custody/assignment changes or completion. Historical alerts remain accessible to their authorized recipient after completion. Foreground inbox polling runs every five seconds when visible, with existing backoff.

## Rollout

Deploy the matching source on the existing sendrack-api service and its push worker, if separately configured. Retain the existing database and private Firebase service-account configuration. Server push requires FCM_ENABLED=true, matching Firebase project credentials and a running embedded/standalone push worker. Do not put service-account credentials in the APK or repository.

Install the signed 0.7.48 APK on both vendor and rider phones. Allow Notifications and the Delivery alerts category; ensure the app reports the device connected for delivery alerts. Test a vendor reaction while the rider is on Profile, on another app and with the screen locked; repeat rider to vendor. Check sound and tap-through to the correct shipment.

## Validation

Automated coverage includes durable cross-account routing, duplicate suppression, authorization, opaque push references, stale assignment suppression, historical tap access, paired browser contexts outside tracking, PIN-protected deep links, existing notification UI and packaged APK startup. Full server regression: 129 passed, 5 skipped, zero failures. Android release compilation and original-certificate signature verification passed. Physical Android background delivery/sound and live Render/Firebase configuration have not been verified from this workspace.
