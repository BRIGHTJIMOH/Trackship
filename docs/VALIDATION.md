# TrackShip NG 0.2.0 validation

Validated on 3 November 2026 with Node 24.22.1, Java 21, Android API 35 / Build Tools 35.0.0 and Chromium.

- `npm test`: 12 tests passed, none failed or skipped. Covers shipment rules, cancellation, public-data privacy, backup validation, distinct rider/vendor onboarding requirements, legacy data migration, assignment filtering, delivery-history reconciliation, API ownership, persistence, CORS, body limits, private rider dispatch and restricted checkpoint writes.
- `npm run test:ui`: passed. Exercises all introduction screens, role selection, vendor setup, rider setup, form validation, saved profiles, relaunch behavior, workspace switching, rider availability, assignment filtering, package wizard, review/confirmation, status updates, package history/search, schematic route, HTTPS connection form, separate-device rider dispatch import, rider completion, vendor refresh, public customer tracking/privacy, backup export/restore, legacy migration and mobile viewport width.
- Browser tests use a temporary SQLite service and isolated browser contexts representing vendor and rider devices. A Playwright HTTPS-origin route forwards requests to the local test service so the actual HTTPS-only connection/import forms are exercised without deploying a public service.
- APK build, alignment, Android metadata and v2/v3 signature verification passed. Version code 2, version name 0.2.0, package ng.trackship.app, minimum Android API 26, target API 35. Same signing identity as 0.1.0.
- Native assets include the redesigned UI and an original generated courier photograph, route illustrations and locally bundled Poppins typography; no remote font/image request is needed to launch offline.

Screenshots: `artifacts/v0.2/`. The APK has not been installed or launched on a physical Android device or emulator during this task. Native Android update installation, share sheet, dialer and file-picker integration still require a device check. No public backend has been deployed, no payment collected and no environment published. The optional Docker recipe has not been built.
