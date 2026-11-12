# SendRack 0.7.12-fcm (build 12)

Source: 1018395f1443e6ddec7eb38e9f96b9b8d938dcba.
Package ng.sendrack.test; retained signing identity; backend https://sendrack-api.onrender.com. Install over the existing app without uninstalling or clearing data.

## Changes

- Rider inbox shows available deliveries and recent updates together. Foreground data updates automatically every ten seconds with one in-flight sync per account; no routine View offers/Refresh notifications/Refresh offers controls. The legacy offers screen also loads and updates automatically. Connected phones hide retry and permission setup controls. Permission or authentication recovery appears only when needed.
- POST /api/v4/rider/dispatch/sync returns the authenticated rider's board and inbox, recovering one creation notice for eligible open deliveries missed before rider registration/identity setup. Unique existing notice keys prevent duplicates. Recovery does not send extra paid SMS. Existing older clients keep their endpoints.
- Keep city/state/vehicle/load/identity/suspension/capacity/open-shipment gates and payment requirements. No automatic verification, funding bypass or simulated location. A new request-scoped inventory scan replaces repeated scans during one board evaluation; known notifications are read once before recovery inserts.
- Quiet updates preserve focus, scroll and previous offers on temporary failure. Old-account results cannot populate a new account. Expired online sessions show a one-time reconnect action; an offline PIN does not bypass online authentication.
- Owner-only Admin -> Delivery setup -> Check shipment matching explains actual reasons, notification counts and active devices for a selected shipment/rider. Selections/results persist through background dashboard refreshes. No phone numbers, dispatch tokens, Firebase tokens, credentials or private addresses in these diagnostics.

## Validation

79 server tests passed with zero skips; new tests cover missing-event recovery/idempotency, identity/payment gates and private matching explanations. Signed APK assets/source hashes, Firebase packaging, browser app flows and Android release lint/signature checks passed. Two independent Chromium sessions tested empty inbox -> automatic offer appearance without navigation/refresh, automatic funding-state update, acceptance, vendor status update, both calls and collection. Controlled slow/outage callbacks verified non-overlap, retained offers/focus, recovery and account isolation. Admin regression and inspector persistence over the background refresh interval passed. Screenshots are sample fixtures, not the user's live deployment. No physical-device/actual FCM receipt or live Render verification; environment network policy blocks Render. No Render resource, database migration or paid-plan change.

## Testing the user's shipment

Deploy the merged backend before testing this APK. Install over the current app, sign in online as Rider once if required, and open the bell. Do not repeatedly refresh. If offers remain empty, owner: /admin -> Delivery setup -> select shipment and rider -> Check matching. Correct the reported account/service-area/vehicle/identity issue; do not weaken matching or mark verification complete automatically. If the shipment is missing from the selector, check that it is present in Admin Shipments (saved-only phone records cannot dispatch). Device connection, matching, funding and actual notification receipt remain separate checks.

SHA-256: 6073af2c40e6c0259190d103623180f5e9b92eb5ab39c6003699a7093e09ba79.
