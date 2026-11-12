# SendRack 0.7.16-fcm: owner-enabled test delivery

For an unpaid test shipment, open Admin → Shipments → shipment tracking code → Enable test delivery. Confirm test data and give a reason. Existing matching riders can then accept and use the pickup/collection journey. Identity, area/vehicle matching, custody and final customer OTP safeguards remain enforced.

This is an audited simulation: payment mode test, simulated true, amount zero, stable test-dispatch reference. No payment-provider calls or ledger funding occur. Existing earnings rules keep test earnings non-withdrawable; live payments, pending live checkout records and wallet holds prevent conversion to test dispatch. Repeating the action is idempotent. Normal unpaid shipments remain blocked until funded. Rider offers in this APK show Test delivery and Test earning.

Install this signed APK over the existing ng.sendrack.test app without uninstalling. Preserves signing certificate SHA256 d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5. Backend changes must be deployed separately; installing the APK alone does not enable the owner action.

Validation: 83 server tests, no skips, including normal unpaid rejection, owner/CSRF/test confirmation, idempotent activation, subsequent rider acceptance and protection of live-payment records. Firebase package and exact APK assets verified. Browser validation covers owner activation/cleanup and the existing extracted-APK journeys. No physical-phone or live Render verification. Git publishing is blocked by missing workspace GitHub authentication; commits and APK are local.
