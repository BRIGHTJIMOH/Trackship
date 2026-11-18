# SendRack 0.7.25 Firebase test APK

This release simplifies the mobile screens and admin console and removes unpublished video placeholders from the public website.

- Opening screen uses a newly generated original bicycle courier illustration inspired by the supplied reference. Transparent WebP is packaged locally; native and server exact asset allowlists include it. No stock watermark was removed. The original generated PNG remains in the private workspace.
- Compact welcome screen with a horizontal remembered-account row and fewer labels.
- Home shortcuts appear before current shipments. The duplicate Home shipment-history section is removed; History remains available through shortcuts and navigation.
- Current shipment cards no longer stretch to match taller neighboring cards. Selected history statistics receive the orange highlight instead of always highlighting Total packages.
- Admin short pages start at the top. Overview contains the live-map workspace, shipment board, cities, legend and attention controls. Summary metrics, activity and recent shipments are in Analytics. Regional Analytics uses existing region-scoped overview data.
- Public video navigation and section stay hidden until videos are published. Draft production-status copy is removed; owner publishing controls remain available.

## Verification

99 server tests passed. Browser checks passed for compact entry, selected history styling, unequal-height shipment cards, vendor/rider home, responsive tracking, admin map/Analytics separation, top-aligned admin pages, unpublished/published video states, quiet refresh and dispatch/pickup flows. The 2,000-record live-map check and regional daily-route checks passed. The exact signed APK web assets were exercised in Chromium against isolated local APIs; this is not Android OS execution or a physical two-phone test.

The pure Java native asset policy test passed, including unknown and traversal path rejection. APK packaging checks verify the illustration hash and compiled native policy. The build verifies the retained certificate before signing; no replacement identity was created and no password is included here. Retained certificate SHA-256:

`d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5`

## Delivery

Install `downloads/SendRack-0.7.25-fcm.apk` as an update to the existing SendRack Test app. This APK uses the existing Render backend. Deploy this source commit to the existing Render service for the server-served admin/website changes. Render deployment and live Firebase receipt have not been verified from this workspace. No Google Maps billing/key or routing configuration was changed.
