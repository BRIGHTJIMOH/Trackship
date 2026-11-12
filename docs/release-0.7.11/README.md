# SendRack 0.7.11-fcm (build 11)

Source commit: 10c0c89ff3b41dd44d997ab23d52ee2e728e1c3e.
Package ng.sendrack.test, retained test signing identity, backend https://sendrack-api.onrender.com. Install over the existing test app without uninstalling or clearing data.

## Registration recovery

Previous builds silently discarded Firebase token-request failures and retained an unbounded local registration marker. This release reports sanitized token/network/server/permission/login states and adds Retry connection in the rider inbox. Retry replaces queued registration work; normal requests retain deduplication/backoff. A success marker expires after five minutes and foreground rider sessions recheck registration periodically. Mark success only after parsing a server response confirming registered=true. Expired online sessions show Reconnect rider account; offline-only rider accounts get a Connect account action. No session, installation secret or Firebase token is exposed by the status bridge.

The dashboard screenshot established server configuration but zero active registered devices. It did not identify the actual phone failure; this APK makes the next attempt observable. No claim that this user's device is now connected.

## Tests

Android release compilation/lint and retained signing certificate passed. Native JVM policy checks cover expiry, clock rollback, account changes, HTTP retry classes and sanitized Firebase error mapping. Packaged APK assets/source hashes, Firebase SDK/new bridge methods, same application flows, two-browser dispatch/calls/collection and controlled map fallbacks passed. Browser tests covered status transitions and Retry connection. These are not Android-device execution or actual FCM receipt tests. No backend/database/Render resource or plan changes required for native registration recovery. Network policy still prevents live Render verification here.

## On-phone check

1. Install over the existing test app. Sign in as Rider.
2. Bell -> enable Android alerts and allow notifications. Tap Retry connection.
3. If prompted, Connect account / Reconnect rider account using the existing verified account. Do not create a duplicate account.
4. Read the connection message, then refresh Admin -> Delivery setup. If still zero, report the exact message (no credentials or tokens).
5. After registration, test a new matching shipment. Device registration does not establish matching, payment readiness or notification receipt. Missing offers remain a separate service-area/vehicle/identity/sync check. No bank funding or verification bypass included.

SHA-256: 8497131475bc32c9e18b67ea3d46639a8ac23ca06d5d3c90420892f45a4d5de0.
