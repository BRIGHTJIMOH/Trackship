# SendRack signup follow-up

Based on `apk-test-v0.7.0` commit `e9b969987d853ea6e4dd7509150a251f5fd89141`.

## Behavior

- Signup retains its live DOM, text, checkboxes and selected files when browser visibility changes or Android invokes `TrackShipLock`. Signup verification/PIN progress is retained too. Signed-in workspaces still lock in the background. This does not restore a signup after OS process termination or a page reload.
- Optional JPG/PNG profile photos are offered during signup, resized to at most 256 px and stored with the account profile. Existing accounts and omitted photos use initials. Profile photo editing after signup is not included.
- Owner route controls support percentage overrides and additional flat platform fees per delivery. Blank percentage inherits global pricing; zero disables the percentage. These apply to new quotes on configured routes. Existing shipment quotes and handler earnings keep their existing semantics. Unconfigured/manual deliveries retain existing fee behavior.
- `/welcome` serves a responsive marketing page with an animated CSS 3D parcel, reduced-motion support and a database-backed waitlist at `/api/waitlist`. Consent is required; email is normalized and deduplicated. No automated email sender is configured by this change.
- The app points to `https://sendrack-api.onrender.com`; Android version code advances to 13, package name remains `ng.trackship.app`.

## Data/deployment

No Render resources, environment secrets or production records were changed. `render.yaml` is unchanged. Startup migrations add nullable fee columns to `admin_routes` and a new `marketing_waitlist` table. Defaults preserve existing route pricing. The SQLite import allowlist includes the new waitlist table. PostgreSQL live migration verification still requires a test database.

## Android signing recovery

The original `/workspace/trackship-signing/test.keystore` (alias `trackship-test`) is absent from the attached environment. No keystore/JKS or signing backup was found in the available workspace, temporary storage, home, shared downloads or mounted backup locations. There is no prior-workspace restore tool available in this session.

The existing `downloads/SendRack-v0.7.0.apk` was verified with apksigner and has certificate SHA-256:

`46d13c6e672b351f992871414a5d2b63dda3a373acd35edfa99a452cdb0d6708`

An APK contains the public certificate, not the recoverable signing private key. Restore the original keystore from the original workspace/provider snapshot or an owner-held copy. Do not uninstall the installed app to work around signing: that risks losing app-private saved data.

The build script refuses to create a replacement key and pins the expected certificate fingerprint. `bash scripts/build-apk.sh` compiles and aligns the updated APK, then stops before signing when the original key is absent. `build/aligned.apk` is unsigned and cannot serve as an installable update. Once the key is restored, rerun the build and verify the resulting certificate before installing over the existing app.

## Verification

- Backend: 38 passed, 4 PostgreSQL-only checks skipped.
- Browser: vendor/rider signup with background/lock simulation, identity files, optional profile photo, returning accounts and existing shipment preservation.
- Owner UI: route/pricing, quote, identity, suspension and session flows.
- Marketing: desktop/mobile layout, reduced motion, real waitlist persistence, no page errors.
- Android: Java/resource/dex compilation succeeds; packaged asset browser test uses the unsigned aligned APK. No physical Android lifecycle/install test was possible.
- iPhone Safari: not verified. WebKit download was blocked by network policy (403 Domain forbidden), and no iPhone is attached. Chromium mobile-size checks do not establish Safari compatibility.

Changes are prepared for review; production deployment and a signed installable APK remain pending these release checks.
