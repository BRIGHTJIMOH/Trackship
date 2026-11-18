# SendRack 0.7.27 — investor demo stabilization

The fixes are implemented in the repository and the APK is signed with the retained SendRack Test key. You do not need to paste code into the app. The accompanying source ZIP contains complete replacement files at their exact repository paths, a patch, and a file inventory for a developer.

## What was wrong

The actual repository is a Node HTTP backend with PostgreSQL in production, an HTML/JavaScript web interface, and a Java Android WebView app using Firebase Cloud Messaging. It does not contain the NestJS/Prisma/Next.js/Expo/Flutter stack mentioned as examples in the request.

1. **A reproducible release mismatch:** 0.7.26 added a mandatory `/api/accounts/session` login check. With the older server, that endpoint returns 404. The app could not finish login, so the Android notification registration call never ran. The new APK authenticates against the existing protected account endpoint when—and only when—the newer endpoint is missing. An invalid token, wrong role or suspended account is still rejected. This is a plausible regression, not proof of what happened on the live phone: live Render and phone diagnostics were inaccessible.
2. **Vendor push was missing:** the previous push registration and notification inbox supported riders only. Vendors saw shipment history inside the app. Vendor registration, background delivery and authenticated reads now use the same push system with explicit role isolation.
3. **Lifecycle events were missing:** the existing queue sent shipment offers. It did not record acceptance, collection, completed handoffs and delivery notifications. Shipment writes now record participant updates in the same database transaction. Vendors also receive recorded transit/checkpoint changes. These are actual events, not predicted delivery results.
4. **Cold-start taps could lose their destination:** the native activity could clear its notification intent before the JavaScript handler existed. Pending notifications now preserve both the destination and vendor/rider role until the correct account signs in.
5. **Notification settings were incomplete:** fresh channels now use high importance, the default notification sound and vibration. A blocked category is identified. The settings button opens Android settings when permission cannot be requested again. Existing user settings are respected.
6. **Token recovery had gaps:** a rejected token could be re-registered and appear connected without becoming deliverable. The server now requests token rotation. A late send result cannot mark a refreshed binding as notified. Retryable failures can recover through automatic registration.
7. **Failure reporting was too quiet:** provider/worker failures now emit structured, sanitized codes; the owner console shows the Firebase project and vendor/rider device counts. Raw tokens, service-account keys and provider response bodies are not logged.
8. **Business errors could log the user out:** an incorrect delivery OTP returned the same HTTP status as an expired login. It now returns a validation error, and the app verifies whether its session is actually invalid before treating another 401 as logout. OTP attempt limits and custody checks remain in place.

## Tracking correction

Location tracking no longer shows My location, Set pickup here, or Pickup pin needed. A small View shipment link is beside the shipment reference. The card contains one contact strip with the real name, available profile photo (otherwise an initial), phone number, call and message icons.

For vendors, the server selects the current handler; before collection it can show the assigned pickup rider. For riders, pickup shows the vendor, while an assigned rider carrying an intrastate parcel or the final-mile parcel can contact its recipient. The server rechecks access on every contact request. A handoff changing the contact during a tap refreshes the contact rather than calling the old handler. Completed/cancelled deliveries and unaccepted previews do not expose active contact controls. Message opens the phone's SMS composer; an in-app chat service was not added.

Missing GPS is never replaced with the viewer's location. Pickup can still use its address/call fallback. The supplied reference layout is followed without inventing a carrier photo, location, route or ETA. Screenshot maps use controlled test tiles, not live-road verification.

## Deploy and configure — exact steps

### 1. Deploy the matching backend

1. Open https://dashboard.render.com/ and select **sendrack-api**.
2. In Settings, confirm its source branch is **apk-test-v0.7.0**.
3. Deploy the merged release commit, using **Manual Deploy → Deploy latest commit** if auto-deploy has not already done so.
4. Wait until Render shows **Live** and its health check passes. The health-check path is `/api/ready`.
5. Keep the existing `DATABASE_URL`, `DATABASE_SSL`, identity encryption key, admin credentials and payment settings. Do not recreate the database or replace the identity/signing keys.

The schema upgrade adds a role column to existing notification tables, defaulting old rows to rider. It preserves old registrations and records. There is no Prisma migration command: this repository performs idempotent schema initialization at server startup. PostgreSQL upgrade/concurrency tests were run locally. A backup under your existing database procedure remains advisable for release rollback; no live data was changed from this workspace.

### 2. Check Firebase, without sharing any secrets

The Android configuration used to build this APK has project **sendrack-fcbe5**, package **ng.sendrack.test**.

1. Open https://console.firebase.google.com/project/sendrack-fcbe5/settings/general and check that Android app **ng.sendrack.test** exists. Use this project's configuration, not a Maps-only API key.
2. Open https://console.cloud.google.com/apis/library/fcm.googleapis.com?project=sendrack-fcbe5 and confirm **Firebase Cloud Messaging API** is enabled. FCM does not require Google Maps billing.
3. Keep using the existing private Firebase service-account file if it belongs to the intended project and works. In Render → **Environment → Secret Files**, its filename can be `firebase-service-account.json`, mounted at `/etc/secrets/firebase-service-account.json`.
4. In Render environment variables, set:

   ```text
   FCM_ENABLED=true
   FCM_SERVICE_ACCOUNT_FILE=/etc/secrets/firebase-service-account.json
   FCM_PROJECT_ID=sendrack-fcbe5
   ```

5. Use one credential method. When using that Secret File, remove stale alternate `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY_BASE64` or `FCM_SERVICE_ACCOUNT_JSON` overrides if they refer to a different account. Do not remove other unrelated service settings. Never upload the private server file as Android `google-services.json`.
6. If logs show `FCM_AUTHORIZATION_FAILED`, check that the private file is readable and its account/key remain valid. If they show `FCM_PERMISSION_DENIED`, `FCM_HTTP_403` or `FCM_SENDER_ID_MISMATCH`, check the target project, FCM API and service-account permissions. The sending identity needs the **Firebase Cloud Messaging API Admin** role for the target project, not a broad Owner role.
7. Save the environment changes and redeploy. Open **Admin → Delivery setup**. Firebase project should show **sendrack-fcbe5** and Firebase server push should show **Configured**.

If you use API-key application restrictions, ensure the Android Firebase configuration is allowed for `ng.sendrack.test` and the retained signing identity. Do not restrict a Firebase client key to Maps services only. No replacement signing key was generated.

### 3. Check the connection and demo records

1. On each phone's browser, open https://sendrack-api.onrender.com/api/ready. It should return a healthy response. A browser health check alone does not prove authenticated push works.
2. The APK uses that HTTPS backend, not localhost. In Render, `ALLOWED_ORIGINS` must retain `https://appassets.trackship.ng` and any existing required website origins. Do not use `*` for authenticated browser access.
3. In Admin → Routes, check that the demo route is active and its states/cities, vehicle and price are correct.
4. Complete the existing rider identity process. On the rider's first login today, choose that route and confirm availability. Route confirmation follows Nigeria time. If a route changed, select the current version again in Profile → Routes for today.
5. Creating a shipment does not necessarily fund it. Use normal configured payment, or the existing owner-controlled test-delivery mode in an eligible test environment. Do not disable production payment, identity, OTP or custody checks to make the demo pass. Mock earnings are not bank money.
6. Admin → Delivery setup → Check shipment matching lets you choose the shipment and rider from lists. It explains route, identity, vehicle, capacity or payment mismatches without needing you to type a tracking reference.
7. No fake production users, shipments, routes or seeded balances were inserted during this work. Live records could not be inspected from here.

### 4. Install and enable sound on both Android phones

1. Install **SendRack-0.7.27-fcm.apk** over the existing SendRack Test app. Keep app data; uninstalling can discard records saved only on the phone.
2. If you have two SendRack icons, check App info: this release is **0.7.27-fcm**, package **ng.sendrack.test**. The older **ng.trackship.app** manual APK does not contain Firebase. Open the correct installed app. Sign in as vendor on one phone and rider on the other. Allow notification permission when requested on Android 13+.
3. Open Android **Settings → Apps → SendRack → Notifications**. Turn notifications on. Open **Delivery alerts** (older installs may show **New delivery offers**) and choose **Alerting/High importance**, a non-silent sound such as **Default**, vibration if desired, and pop-up/banner notifications where available.
4. Enable lock-screen notifications. Increase **notification** volume, not only media volume, and turn off Do Not Disturb for the test.
5. Existing notification channels cannot be silently upgraded over the user's settings. If this app was already installed with a low/silent category, Step 3 is necessary. There is no need to uninstall the app.
6. On phones that restrict background apps, allow SendRack's background activity if notifications are delayed. Google Play services and internet access are needed for FCM. These restrictions cannot be verified from source code.
7. Reopen SendRack and sign in. Registration is automatic; repeat Retry connection is not the normal workflow. Admin should show at least one active rider device and one active vendor device for this two-phone test.

One phone has one active account binding. Switching accounts or logging out removes the previous binding and displayed alerts. The screen can lock for PIN protection while the native notification session remains active in the background.

## Real-phone acceptance checklist

Use new, clearly labelled demo shipments and record which phone/state you tested. Confirm actual phone sound and banners; an FCM acceptance counter alone is not proof.

- [ ] **Foreground rider:** keep the rider on Home. Create a matching shipment from the vendor. Confirm an offer appears and the phone receives an audible notification when permission/settings allow it.
- [ ] **Background rider:** press Home and open another app. Create another matching shipment. Confirm the Android notification appears without opening SendRack. Tap it, sign in if requested, and confirm it opens the rider's notifications/offers.
- [ ] **Locked rider:** lock the phone, then create another matching shipment. Confirm sound and a lock-screen notification. Unlock/tap it and confirm correct account access.
- [ ] **Closed rider:** dismiss SendRack from Recents after a successful login, then repeat. This is different from **Force stop** in Android Settings. Android deliberately blocks push to force-stopped apps until reopened; the app cannot bypass that rule.
- [ ] **Vendor acceptance:** background or lock the vendor phone. Accept a funded or legitimately test-enabled parcel on the rider phone. Confirm an audible vendor update. Tap it and confirm the vendor's Delivery updates screen opens, not the rider screen.
- [ ] **Collection and tracking:** rider calls the vendor, checks the parcel and explicitly collects. Confirm custody changes only after that action. Vendor tracking shows the current handler strip; the rider's tracking contact changes to the recipient where appropriate. Call and message buttons use the displayed actual contact.
- [ ] **Transfer and Accept:** for an interstate demo, use separate authorized pickup, carrier and final-mile accounts. Request the transfer and have the next handler explicitly accept it. Confirm the vendor's current contact changes and the affected participants receive updates. Do not share private dispatch links publicly.
- [ ] **Delivered:** request the real delivery code using the configured SMS provider. Enter one incorrect code: it must show an error, keep the rider signed in and keep the parcel undelivered. Complete with the recipient's valid code only after handover. Confirm a vendor update, final state and no duplicate earnings on replay. If SMS is not configured, delivery correctly remains blocked; this release does not invent a code.
- [ ] **Weak network:** turn off data briefly, then restore it. Existing records should stay visible where already loaded; an interrupted send must not be reported as received. The same shipment ID retries without creating duplicates, and registration retries automatically. Initial online login correctly needs a working connection.
- [ ] **Logout privacy:** sign the rider out. New offers must not appear on that logged-out session. Sign in again and confirm registration recovers. Check the same behavior for the vendor.
- [ ] **Owner diagnostics:** after testing, check active device counts, notifications accepted by FCM, pending and failed sends. If an offer is missing, use Check shipment matching. If FCM rejects a send, use the sanitized code in Render logs.

For the locked/background/closed tests, repeat on the vendor phone as well. Only statuses actually recorded by the existing workflow generate updates. No new failed-delivery/return workflow or fabricated “undelivered” event was added.

## What the audit verified and what remains unknown

Verified locally: authenticated role-separated token registration and reads; token rotation, retry and account changes; stale-response protection; transaction-backed lifecycle events; assignment/contact privacy; end-to-end pickup, transfer, OTP completion and earnings safeguards; CORS/origin behavior; responsive tracking; signed APK contents and native compilation. The production-style database tests use isolated PostgreSQL schemas, with local Redis for the queue test.

The release checks passed **104 server tests**, **34 wallet tests plus the Redis queue test**, pure Java policy checks and browser workflows. Browser tests use controlled APIs/native bridges and are not Android OS execution. The final APK manifest includes notification/vibration permissions and FCM reception services; the retained certificate was verified.

Not verified: the current Render deployment, private server secret values or IAM permissions, live database contents, real FCM acceptance/receipt, device sound/lock-screen/battery settings, physical GPS, live map-provider roads, or bank/SMS provider delivery on your accounts. Requests to the live Render host are blocked by this workspace's network proxy (403). There is no Render connector or deployment credential here, and no physical Android device is attached.

Authentication has no refresh-token API in this repository. Expired sessions require secure sign-in; this release does not silently extend them. There is no native iOS/APNs/TestFlight verification in this Android release. Google Maps navigation/billing was not introduced or changed.

## Code and development notes

See `FILES.md` for the exact full-file inventory. The ZIP contains complete files and `changes.patch`; no server service-account file, Android `google-services.json`, signing key, password or node_modules is included.

Run the backend with Node 24. Configuration comes from the process environment; merely creating a `.env` file does not load it. For local development, use a private environment file with Node's `--env-file` option or export variables in the shell. Production requires the existing PostgreSQL URL/SSL policy. Browser tests use isolated localhost fixture servers; the released native APK always uses the public HTTPS service. A physical phone cannot reach a developer computer via its own localhost.

The Android build still runs `scripts/build-firebase-apk.sh`, consumes the matching Android configuration locally and refuses to sign if the existing certificate does not match. Retained certificate SHA-256:

`d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5`
