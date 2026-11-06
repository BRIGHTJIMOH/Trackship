# Configuration of the completed SendRack build

Scope: deployment-branch merge `a361f89ffebc4e25627acb99448fd8c33833035b`, backend release 0.7.1 and side-by-side APK `ng.sendrack.test` version 0.7.1-test.1. This inventory is checked against that commit's source. Unmerged dispatch/staff/push code is distinguished below. Do not send credentials in chat or commit them.

## Exact implemented settings

| Feature | Exact variable names | Implemented provider / behavior |
| --- | --- | --- |
| Map tiles | `PUBLIC_MAPTILER_KEY` | Optional **public browser key** for MapTiler Streets v2, displayed by Leaflet. Empty/invalid key selects the existing OpenStreetMap pilot fallback. No Google Maps key is read. Restrict a real MapTiler display key to your hosted and app origins. |
| GPS uploads | **No GPS-specific environment key** | Browser Geolocation / native Android LocationManager send authenticated HTTPS v3 updates. Current assignment/custody, explicit consent and an active session are required. Device location and Android notification/foreground-service permissions matter; a map key does not obtain GPS. |
| GPS/API foundation | `DATABASE_URL`, `DATABASE_SSL`, `ALLOWED_ORIGINS`; public-origin override `TRACKSHIP_PUBLIC_URL` | Keep existing database/TLS/origin values. The Android virtual asset origin is `https://appassets.trackship.ng` for both package IDs; different application IDs still isolate local data. Public URL falls back to Render's `RENDER_EXTERNAL_URL`. The API URL is compiled into the APK. |
| Customer delivery OTP | `TERMII_API_KEY`, `TERMII_SENDER_ID` | **Termii SMS** sends the separate delivery code to the recorded recipient phone. Both are required, plus an approved/funded provider account. In this completed v3 flow, an assigned final handler requests the code at the final-delivery checkpoint; it expires after 10 minutes, has five attempts and a 60-second resend cooldown. Missing/failed SMS does not complete delivery. |
| Optional delivery-offer SMS | `TRACKSHIP_SEND_JOB_SMS` | Existing true/false switch for optional job alerts only. Turning this off **does not disable customer delivery OTP** or legacy sign-in SMS. |
| Current matching | `TRACKSHIP_RIDER_CAPACITY` | Existing service-area offer capacity, separate from map display and device GPS permissions. |
| Current Android alerts | **No Firebase/APNs variables** | Persisted REST inbox, foreground polling and OS-scheduled Android JobScheduler checks/local notifications. Android may delay its 15-minute periodic job. These are not guaranteed instant/background push. Notification permission, network and a valid rider session are needed. |
| Signup/login email | `RESEND_API_KEY`, `EMAIL_FROM` | **Resend** for expiring single-use account-verification codes. This is separate from the Termii delivery OTP. For no-domain testing, sender is `SendRack <onboarding@resend.dev>` and recipients must use the email registered to the Resend account owning the key. A verified sending domain is required later for arbitrary recipients. |
| Paid-delivery gate | `PAYSTACK_SECRET_KEY` | **Paystack** provider-confirmed payments precede funded dispatch. The webhook uses this same provider key; no separate invented webhook-secret variable is read. Preserve the current test/live mode; do not switch it to test another feature. |
| Payout switch | `TRACKSHIP_ENABLE_PAYOUTS` | Existing true/false switch. Internal earnings and provider-confirmed bank payout remain separate. Preserve current setting. |
| ID uploads | `TRACKSHIP_IDENTITY_KEY` | Existing encryption key; **preserve exactly**. Do not generate a replacement because a new APK/map is being configured. |
| Owner map access | `ADMIN_USERNAME`, `ADMIN_PASSWORD` **or** `ADMIN_PASSWORD_HASH` | Existing cookie/CSRF owner login. The map is available after login with no preview/map-enable flag. Raw shared `TRACKSHIP_ADMIN_TOKEN` is not a map-login credential. Preserve that existing operator token for its existing purposes. |

There is **no** `GPS_API_KEY`, `GOOGLE_MAPS_API_KEY`, `FCM_SERVER_KEY`, `APNS_ENABLED`, `DELIVERY_OTP_TTL`, or active `DELIVERY_CODE_TTL_HOURS` setting in this released build. The current OTP lifetime, upload freshness and platform scheduling limits are code values, not secretly configurable by adding an environment variable. The draft v5 journey-long delivery-code policy is not the completed v3 runtime.

## Render: supplied vs. unverified

The repository's existing `render.yaml` declares these settings for the existing service; this is **Blueprint evidence, not a live inspection of Render's Environment page**:

- `NODE_VERSION`: 24.22.1; `NODE_ENV`: production; `HOST`: 0.0.0.0.
- `DATABASE_URL`: existing Render PostgreSQL connection from `sendrack-db`.
- `DATABASE_SSL`: disable for that private/internal connection. External/public PostgreSQL must use the existing verified TLS policy; do not copy the internal value onto an external connection.
- `ALLOWED_ORIGINS`: the app's virtual asset origin.
- `TRACKSHIP_IDENTITY_KEY`, `TRACKSHIP_ADMIN_TOKEN`: generated when provisioned. Preserve existing values; do not reapply the Blueprint to rotate them.
- `ADMIN_USERNAME`: owner. `ADMIN_PASSWORD` is a private value the operator supplies (`sync: false`), **not** a Render-generated default password.
- `TRACKSHIP_ENABLE_PAYOUTS`: false; `TRACKSHIP_SEND_JOB_SMS`: false; `TRACKSHIP_RIDER_CAPACITY`: 5 as declared defaults. Existing service overrides must be preserved.

The code also reads Render's platform-supplied `PORT`, `RENDER_EXTERNAL_URL`, `RENDER_GIT_COMMIT`, `RENDER_GIT_BRANCH`. They are not provider keys and normally do not need manual copying. `/api/version` reports the runtime commit/branch when available and otherwise returns `null`; it does not fabricate a deployed version.

Render does **not** automatically supply MapTiler, Termii, Resend, Paystack, Firebase or Apple credentials. No live provider settings, recipient account email or current running commit have been inspected here: the environment blocks the Render hostname and exposes no Render connector/credentials. No existing setting, plan or resource was changed. Use Render's own private UI/secret manager to check or supply values; never paste them into chat.

## Safe example and build-only settings

The root [`.env.example`](../../.env.example) contains the completed runtime variable names with **empty placeholders only**. It is an inventory, not a working environment and **not an update to apply wholesale to Render**. Preserve existing values and fill only the needed entries privately. Do not load an empty template over a working production service. `DATA_DIR` is for local SQLite development, not a replacement for production `DATABASE_URL`.

The APK already embeds `https://sendrack-api.onrender.com`; it does not read server `.env` files. `SENDRACK_TEST_SERVICE_URL` is an optional **build-time** override in `scripts/build-test-apk.sh`, not a Render GPS variable. `SENDRACK_TEST_KEY_DIR` selects the separately retained test signing directory; the original build uses `TRACKSHIP_SERVICE_URL` / `TRACKSHIP_KEY_DIR` and its original certificate pin. These variables do not belong in the provider/runtime example. No signing password, provider private key or server identity key belongs in the APK.

## Firebase / Apple files

**None are required or consumed by the completed build.** It has no Firebase SDK/Google Services plugin and no native iOS application.

For future review only, [config/push-future](../../config/push-future/README.md) contains:

- Placeholder-only `.env.example` with the exact **unmerged** HTTP-v1 FCM/APNs adapter variables.
- `google-services.json.example` illustrating native Firebase client configuration. Obtain the real generated file privately after registering each exact application ID; it is not a server service-account key.
- `SendRackPush.entitlements.example` illustrating the future native iOS `aps-environment` key. The actual .p8 key/provisioning profile must come privately from Apple; no private-key template is published.

These templates cannot activate notifications. The draft adapters require native SDK/token lifecycle, worker integration, account setup and actual device/provider tests; their production activation remains blocked. They must not be confused with the current Android inbox/local notification implementation.
