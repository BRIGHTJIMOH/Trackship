# Deployment map fix and separate SendRack Test APK

## Missing map: cause and fix

The user reconfirmed Render's deployment branch as `apk-test-v0.7.0`. At investigation time its fetched head was `00f45703645acdd31d4cf662f48dfc6ddf6c0740`. The Live Operations Map existed only in unmerged draft PR #9, based on unmerged PRs #7/#8. Consequently, the deployment branch had neither the map module nor its feed. This was a deployment-branch integration gap, not an empty-GPS permission setting.

This release ports the tested map directly onto the deployment branch and integrates the separately prepared email-verification PR #4. It does not activate or merge the unfinished v5 dispatch/staff feature stack. The map needs no preview flag. Overview preserves its existing owner login, KPI cards and other features. Map access requires the existing authenticated owner/super-admin cookie; anonymous, vendor, rider and shared machine-token requests are rejected. New individual operations-staff credentials remain separate work.

The map section now explicitly shows **No active shipments yet** or **No fresh GPS data yet** with an explanation. It remains visible without any GPS markers. There is no fabricated city-centre/parcel position. Old uploads missing observation time are last-known only; current-holder consent, session, custody and both observation/receipt freshness checks still apply. Route filters, clustering, carrier batching, detail panels, attention flags and stable refresh behaviour are retained.

The admin HTML references only served assets; an inherited preview-only script reference was removed. Local browser checks confirmed every same-origin admin asset returned successfully, no JavaScript errors occurred, and empty/no-GPS states rendered even with tile requests deliberately blocked.

[Local no-GPS Overview screenshot at 1366×768](admin-map-no-gps-1366.png). This is a local test screenshot, **not** evidence that Render has deployed it.

## Exact deployment comparison

`GET /api/version` reports the runtime `RENDER_GIT_COMMIT`, `RENDER_GIT_BRANCH`, backend version `0.7.1`, and map/email feature presence. It returns `null` for an unavailable commit instead of inventing a running SHA. After deployment, compare that commit with the deployment-branch merge SHA shown in GitHub/Render.

The managed environment's enforced host policy still blocks `sendrack-api.onrender.com`: a live readiness request failed at the proxy with `CONNECT ... 403`, before reaching Render. There is no Render connector or configured Render credential here. The user supplied the branch but not a running deployment SHA. Therefore the actual current running Render commit, Auto-Deploy status, environment values and live signup/email delivery remain **unverified**. The merged Git commit is a deployment target, not a claimed observed runtime version.

After the branch merge, use Render's latest-commit deployment if Auto-Deploy does not start. Preserve the existing service, database, region, free plans, keys and saved records. Do not apply a Blueprint, recreate resources, reset the database or rotate existing credentials. Check:

- `https://sendrack-api.onrender.com/api/version` — runtime commit/branch/features.
- `https://sendrack-api.onrender.com/api/ready` — database readiness.
- `https://sendrack-api.onrender.com/admin` — owner login → Overview map and explanatory empty state.
- `https://sendrack-api.onrender.com/app` — vendor/rider signup and returning account access.
- `https://sendrack-api.onrender.com/` — marketing and waitlist; old `/t/<secret>`, `/r/<secret>` and payment-return links must remain valid.

## Separate signed Android test app

- Label: **SendRack Test**.
- Application ID: **`ng.sendrack.test`**, different from original `ng.trackship.app`.
- Version: **`0.7.1-test.1`**, version code **1**.
- Backend compiled into packaged assets: **`https://sendrack-api.onrender.com`**.
- Android minimum API 26; target/compile API 35.
- Original Android manifest, original build script, original package and original certificate pin are preserved. No original key was replaced and no uninstall is required. The build rewrites package/classes only in its isolated build directory.

The original `/workspace/trackship-signing/test.keystore` was not present, and searches of available workspace/temp files and Git history found no keystore/JKS backup. No other original build workspace or CI key backup is connected here. The new test app uses a **different** RSA-3072 signing identity, alias `sendrack-test`. Its public certificate SHA-256 is:

```
d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5
```

The signed APK and SHA-256 manifest are in `downloads/`; see `SendRack-Test-0.7.1-test.1.json` for the exact artifact checksum and build-source commit. APK signature verification and manifest inspection succeeded. This is a separately signed test application, not an update APK for the existing SendRack installation.

### Data separation

The test app targets the same live backend, so authenticated cloud writes are real once it is deployed/configured; the different application ID does not create a separate server database. Use accounts and recipient contacts you control. Do not change existing payment mode or payout settings just to test.

The two application IDs have separate Android storage, WebView local storage, app PINs, identity vaults and Android Keystore namespaces. **Local records do not automatically transfer between installations.** Keep the existing app installed. Previously server-synced records can be retrieved only by authenticating the corresponding existing cloud account. Phone-only accounts without verified email require authenticated email linking from a valid existing cloud session or legitimate SMS/recovery access if available; knowing a phone/new email does not grant access. No account is silently recreated or marked verified.

### Private test-key retention

The new test key, strong random password file and pinned certificate are retained outside Git in `/workspace/sendrack-test-signing` (directory mode 0700, files 0600). The build refuses partial/mismatched identities rather than replacing them. The original signing directory cannot be selected for this test build.

An AES-256-GCM encrypted recovery copy is retained privately at `/workspace/shared/private-sendrack-test-signing.enc`; its separate binary recovery key is `/workspace/private-sendrack-test-recovery/backup.key` (0600, parent 0700). Neither recovery file, password nor keystore is published in Git or embedded in the APK. An authenticated restore into a temporary private directory recovered the same certificate successfully. The restore helper refuses an existing directory or the original signing directory.

**These are workspace copies, not a claim of permanent offsite storage.** Before this environment is replaced, archive the private key directory and/or the encrypted backup plus its separately stored recovery key in your private password manager/vault. Do not put these secrets in chat, the public repository, downloads or ordinary logs. No external private vault connection is available here, so durable off-workspace archival remains an owner action.

## Email-provider configuration

In the **existing** Render service's private Environment settings, preserve current values and supply:

| Setting | Value |
| --- | --- |
| `RESEND_API_KEY` | Your private Resend account API key; enter directly in Render, never chat/APK/source |
| `EMAIL_FROM` | `SendRack <onboarding@resend.dev>` |

No domain is needed for this test sender. Resend permits recipients only at the **email registered to the Resend account owning that key**. Use that same account email for vendor/rider tests; roles remain separate. Arbitrary customer/public signup emails need a verified sending domain later. The server does not silently choose a sender, bypass codes or auto-verify accounts when configuration/delivery fails. Do not put the Resend key in the APK.

Codes expire after ten minutes, are single-use, enforce attempt/resend limits and preserve in-memory signup details/ID uploads through email errors and file selection. Returning email login uses the existing cloud identity. Sensitive pending ID photos are not stored in browser localStorage; terminating/reloading an unfinished signup may lose that in-memory draft. See [email flow and legacy-account rules](../EMAIL-VERIFICATION.md).

## Validation and limitations

The release test matrix and exact APK checksum are recorded in `downloads/SendRack-Test-0.7.1-test.1.json`.

Completed locally:

- Unit/API suite, including expiring/single-use email codes, limits, returning-account identity, authenticated legacy linking, provider failure/restricted-recipient handling, pricing/payments/tracking, map access/freshness/deltas and data preservation.
- Main UI browser tests: vendor/rider signup, ID/profile photo selection, background/file-selection form retention, email-code failures/resends, identity upload retry, shipment creation, provider-confirmed test funding, custody/OTP completion and returning cloud login.
- The **assets extracted from the signed APK**, with their unmodified Render backend URL, ran the same browser flow. Requests to that URL were explicitly intercepted to an isolated local backend with simulated email/SMS/payment providers. No production test accounts, ID documents or payments were created by these tests. This confirms packaged assets and code flow, not a live Render round trip.
- Existing owner-dashboard and route/pricing quiet-refresh browser tests passed. New browser checks confirmed map/no-GPS states, zero same-origin asset failures and no JavaScript errors. Map's earlier 2,000-record clustering benchmark remains a local sample-data test, not a live performance promise.
- Java compilation, DEX/resource build, APK signing, signature and package/label/version checks succeeded. The manifest includes internet, fine/coarse location, foreground-location service and Android notification permissions. Source requests fine/coarse location and, on Android 13+, notification permission before starting visible foreground GPS sharing; denial does not record a fake position.

Not verified: real Resend delivery/configuration on Render, real signup/upload/tracking against the live host, actual deployed SHA, physical Android/iPhone, Android emulator install/runtime/file-picker lifecycle, OS permission prompts/background survival, actual GPS/native notification delivery, or PostgreSQL-only checks without a disposable PostgreSQL instance. No adb/emulator/device was available. Browser emulation, simulated native-vault contracts and static permission inspection are not physical-device tests.

No existing Render resource, environment value, free plan, payment configuration, original signing identity or saved account was changed by provisioning. Email schema changes are additive and do not mark old accounts verified. The map uses existing tiles and bounded polling/deltas; larger fleet/history/concurrent-user loads still require the scaling/egress review documented in [map notes](../live-map/README.md), before any paid provisioning.
