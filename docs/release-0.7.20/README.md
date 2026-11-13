# SendRack 0.7.20 — rider routes, automatic tracking and phone layout

Release prepared on top of production branch `apk-test-v0.7.0`, base `c355bb7`. Preserves build 19's owner-controlled unpaid test delivery mode, pickup map/receipt confirmation, contacts, quiet inbox recovery, test cleanup and existing financial safeguards. The separate Paystack sandbox from `paystack-test-ledger` is NOT part of this release. No environment value, billing plan, database credential or live payment setting is changed.

Changes:

- Vendor home keeps the fleet/vehicle tiles above a compact Shipment history summary. This opens an all-shipment view with counts and individual detail links. Existing terminal-only History remains available from the navigation bar.
- Unchanged vendor snapshots do not redraw the page. Actual same-page updates preserve scroll; navigation between screens resets it.
- Rider availability is declared per configured route and direction under **Routes and availability → Routes I’m available for**. An available selection is required for open offers. Existing pickup area, identity, vehicle, weight and capacity checks remain. Route edits require renewed selection. Unconfigured legacy shipments are not broadcast as open offers; private dispatch remains compatible.
- Every currently matching rider can receive an offer; the first valid acceptance wins. Queued push delivery rechecks eligibility before sending. New events wake the queue promptly, with the durable fallback sweep retained.
- Tracking starts automatically toward pickup after acceptance, without claiming parcel custody has changed. Confirming collection starts the journey in the same transaction for new clients. Customer OTP and interstate handoffs remain enforced. Older clients retain compatible manual action APIs.
- Automatic location uploads cover all active parcels assigned to the authenticated rider. Completion, handoff and revoked sessions stop the corresponding tracking. Android shows a foreground notification and respects OS permissions/settings. Manual GPS and delivery-sync controls are removed from the updated app.
- Android insets resize the WebView container around system bars, cutouts and keyboard. Browser safe areas, responsive header wrapping, landscape spacing and system font scaling are handled.

Compatibility note: existing riders must explicitly select route availability. Do not invent their intended route from an old pickup-city profile or GPS heading. Browser `/app` can save availability against the same existing cloud account. Packaged native interface/GPS changes require the updated APK.

Validation of the integrated production candidate:

- 92 server/API tests pass against disposable PostgreSQL, including production's test-dispatch, contacts, recovery, migration and concurrent-acceptance tests updated with explicit route declarations.
- Wallet mock regressions pass; optional Redis integration remains skipped when Redis is absent. Paystack sandbox tests are intentionally excluded with that implementation.
- Browser checks pass for vehicle/history ordering, all-shipment counts/detail navigation, unchanged/changed polling scroll, small widths, landscape/cutouts and long/enlarged greeting text.
- Browser rider flow saves route availability, accepts an eligible offer, starts the simulated native GPS service, retains explicit collection confirmation, starts delivery automatically and finishes with customer OTP/automatic GPS stop. Native bridge and external messaging are simulated; these are not physical-phone tests.
- Android build 20 compiles, and package/assets/Firebase checks run against the unsigned candidate. Package remains `ng.sendrack.test`; version is `0.7.20-fcm`, version code 20.

Release limitations:

- Render's public version endpoint is blocked by the managed network proxy (`CONNECT` HTTP 403). A GitHub production-branch push is not itself proof of a completed hosted rollout. Verify `/api/version` running SHA and `/api/ready` in Render after deployment; new version feature fields are `riderRouteDirection` and `automaticRiderTracking`.
- The retained signing directory and encrypted recovery pair are absent from this workspace. Build output `artifacts/SendRack-0.7.20-fcm-unsigned.apk` is NOT an installable update and is not published in downloads. No replacement signing identity is generated. To finish the native release, use the retained `sendrack-test` identity in the workspace/private vault that owns it, run `scripts/build-firebase-apk.sh`, and verify signer SHA256 `d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5` before publishing the signed APK.
- Keep the current app installed and preserve its storage. Test real FCM delivery, permission denial/recovery, phone sleep/background GPS, three-button/gesture navigation and cutouts on actual phones before declaring device behaviour verified.
