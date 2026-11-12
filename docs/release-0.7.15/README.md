# SendRack 0.7.15-fcm (Android version code 15)

Completed and cancelled shipments appear in History for both vendor and rider. Pending work remains on Home regardless of age. Rider updates older than 24 hours, or belonging to completed work, appear under Earlier updates in History. Incoming offers show five at a time with Show more. Search on Home still finds all deliveries.

Owner dashboard → Shipments: select test records, Delete selected tests, review, confirm test data, type DELETE TEST SHIPMENTS, then submit a reason. Deleted tests are hidden from operational views and their tracking/dispatch links are disabled. Choose Deleted tests in the status filter to inspect or Restore to History as cancelled. This is reversible soft deletion; audit and financial records remain. Any wallet hold, live payment/earnings, or unconfirmed paid mode prevents removal. No production records were removed while building this release.

Install downloads/SendRack-0.7.15-fcm.apk over the existing ng.sendrack.test app; do not uninstall or clear storage. Existing signing identity retained. Firebase project sendrack-fcbe5. No credentials packaged as JSON.

Validation: 82 server tests passed with no skips; existing admin browser suite; admin cleanup browser (selection, review, confirmation, deleted filter, restoration); signed APK extracted assets tested in Chromium including both History screens, two-session create/funding/accept/call/collect, dispatch recovery and pickup fallback; exact asset hashes and Firebase package checks. Signed certificate SHA256 d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5.

Screenshots use synthetic sample data. No Android OS/physical two-phone execution or live Render deployment verification. Maps still use existing MapTiler/OSM configuration; Google Maps Platform integration is not included. Verify real map tiles, confirmed pickup pin, external directions and explicit collection on a physical phone; controlled map tests do not prove provider access in production.
