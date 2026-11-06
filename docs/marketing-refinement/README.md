# Marketing refinement review

Prepared against deployment-branch merge `a361f89ffebc4e25627acb99448fd8c33833035b`. This update is for review before deployment; no Render resources, settings, plans, records or signing keys were changed.

## Review assets

- [1366 desktop](site-1366.png), [1920 desktop](site-1920.png), [390 mobile](site-390.png), [360 mobile](site-360.png).
- [Desktop phone demonstrations](phones-1366.png).
- [28-second animation recording](animation.mp4), [poster](animation-poster.png). Actual browser rendering, showing automatic transitions and pause/select controls, without audio.

## Changes

Replaced accumulated layout overrides with consistent centred columns, responsive headings and spacing. The 3D cube faces share one dimension/depth and the scene bounds fit their viewport; the fix does not hide page overflow. Orange, charcoal and cream branding remains.

Phone frames include bezels, lens, side button, depth and gentle tilt. Actual local SendRack application screens use one fictional SAMPLE-001 shipment and separate vendor/rider accounts. Vendor sequence: dashboard, create shipment, details, tracking. Rider sequence: assigned deliveries, handoff details, tracking. These are labelled screenshots of the product, not live accounts or live GPS. Full-size links allow closer reading.

Screens advance every six seconds. Each journey has independent pause, previous/next and named screen selection; selecting a screen pauses it and retains keyboard focus. Reduced motion disables automatic transitions and tilt while retaining manual controls. Offscreen/hidden-page animations and timers pause. Parcel motion is 3.9 seconds, previously 4.6 seconds, with modest smooth movement. Waitlist requests prevent duplicate in-flight submits and retain inputs on network failure.

## Verification

Local Chromium checks passed at 1366×768, 1920×1080, 1093×768, 900×768, 801×768, 768×1024, 430×932, 390×844, 360×800 and 320×700. No horizontal overflow or clipped parcel faces across nine motion phases; sample assets loaded. Separate journey tests cover autoplay, independent pause, manual controls/focus, full-size links and reduced motion.

Browser integration checks passed for mobile-size and desktop layouts, waitlist submission and owner listing, retained storage across root/app navigation, admin login and payment-return navigation. Server suite: 58 passed, 4 PostgreSQL-dependent/production checks skipped, 0 failures. Unit coverage includes duplicate waitlist handling and existing routes, tracking, callbacks and permissions. Mobile checks are Chromium viewport emulation, not physical iPhone/Android testing. No live Render verification was possible in this environment.

## Inaccessible references

All four supplied Pinterest references were attempted before design changes and returned inaccessible-tool errors. Their visual contents could not be reviewed; no claim of matching them is made:

- https://pin.it/7xQJYimlm
- https://pin.it/3CipoBwfi
- https://pin.it/7yWO5wxEN
- https://pin.it/3MyjlVjeC

## Deployment

Review and merge this branch into `apk-test-v0.7.0` to use the existing Render service deployment workflow. Confirm Render’s actual running commit through `/api/version` after deployment. No database migration or new provider/resource is required. The separate configuration templates document active providers and deliberately inactive future push references; do not import empty values over Render settings.
