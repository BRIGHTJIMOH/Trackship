# SendRack 0.7.10-fcm (build 10)

Source: 22e515e3291781b1b97ea08214be010f0397009e.
Package ng.sendrack.test, retained signing certificate, backend https://sendrack-api.onrender.com. Install over the current test app without uninstalling. Firebase, minimal rider home and map/profile corrections retained.

## Changes

- Delivery contacts near the top of shipment details: assigned rider -> vendor; owning vendor -> assigned pickup/carrier/last-mile handlers. Native Android ACTION_DIAL opens the dialler; no automatic call and no CALL_PHONE permission.
- Contacts are retrieved from the server, not untrusted shipment input, and revalidated before opening the dialler. Unassigned, unrelated and suspended accounts cannot retrieve them; ended deliveries return no contacts. No added contact fields on public tracking or push payloads.
- Owner-only Admin -> Delivery setup reports email/FCM configuration, active device registrations, FCM acknowledgements/pending/failures, and funding mode. Configuration/FCM acceptance are not proof of device receipt. Credentials and registration tokens are never returned.

## Verification

77 server tests passed, zero skips. Packaged APK browser suite, exact source/asset checks, Firebase packaging, lock-aware notification entry and Android release lint passed. Admin browser regression passed, including route/pricing controls. Two independent Chromium sessions running extracted APK assets tested vendor creation/sync, unpaid acceptance rejection, controlled test-provider funding, rider acceptance, automatic vendor status refresh, both dialler bridge calls and collection. Screenshots use isolated sample accounts/provider data, not live customer records. Signature matches the retained test identity.

No physical Android devices, real phone call, live Firebase receipt, bank transfer or Render deployment verification. Managed environment proxy blocks sendrack-api.onrender.com (CONNECT 403). The user reports Firebase Render settings added; this could not be independently verified. No database migration, paid service, Render resource or free-plan change. Real automatic bank funding remains unconnected; no money or verification bypass added.

## Firebase setup and two-phone check

1. Keep the Firebase Admin service-account JSON only in Render Secret Files, filename firebase-service-account.json. It must belong to the Android Firebase project. The Android google-services.json is not the server credential.
2. Set FCM_ENABLED=true and FCM_SERVICE_ACCOUNT_FILE=/etc/secrets/firebase-service-account.json on the existing sendrack-api service. Preserve all other environment/database settings.
3. Deploy the merged backend commit. Open /admin -> Delivery setup; check Firebase is configured.
4. Install this signed update on both test phones. Use separate vendor/rider accounts. Rider: log in, tap the bell and Enable Android delivery alerts, then allow notifications. Check an active registered device appears in admin.
5. Create a matching route/vehicle/area shipment. Unfunded shipments cannot be accepted. Check funding mode first: mock funds are sample money, not real bank funds. Do not treat checkout configuration as automatic live-wallet funding.
6. Test a funded delivery: rider receives/opens its offer, accepts, then sees Call vendor. Vendor sees Rider accepted and Call pickup rider. Confirm collection only when the parcel changes hands. Keep physical-device receipt/call results separate from browser tests. Free-host cold starts and Android background restrictions can delay delivery.

SHA-256: 10aecbcbbefadf8858c8874789b359bba5da9866e1b01d46a41d94d636d65ba0.
