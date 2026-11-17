# SendRack 0.7.23-fcm — reference-based mobile and admin refresh

This release combines the requested interface refresh with the 0.7.22 notification recovery fixes. It retains the existing Android package, data, signing certificate, Firebase project, routes, payment controls and regional authorization.

## Delivered screens

- Opening: static SendRack mark and name on an orange background, with the branded delivery scooter illustration grounded at the bottom. The first green reference informs only this opening layout; its grocery homepage was not copied.
- Vendor Home: search, New delivery / Track package actions, compact Shipment history above Current shipments (the latest requested order), horizontal current shipment cards, recent completed/cancelled history and Check rate / Pick up / Drop off / History shortcuts. Vehicle choice remains available in package creation. Wallet & activity is a small entry rather than a large balance block.
- Rider Home: Delivery offers / Track package actions, compact Work history above current deliveries, incoming offers with existing acceptance controls, route/pickup/drop-off/history shortcuts. Daily route selection and same-day availability remain server-backed.
- Tracking: real map above a dark shipment card with status progression, recorded pickup/destination information, actual dates, package/customer details and the assigned contact. Past checkpoints are green, the current checkpoint orange and future checkpoints subdued. One relevant handler appears on the compact tracking card; full assigned contacts remain in delivery details. Profile photos are used when available, with initials as fallback. Calls and SMS revalidate authenticated contacts before opening the phone dialler or SMS composer. No message is sent automatically and no in-app chat service is claimed.
- Owner console: dark charcoal/red theme, slim navigation rail with accessible labels/tooltips, delivery list beside the live map and a selected-shipment panel over its lower edge. Filters, map diagnostics and custody details are expandable. Tablet/mobile layouts stack the board and provide a horizontal delivery list. Existing routes, regional teams, local pricing, website videos, finance entry points and other owner tools remain accessible.

## Installation and deployment

Install downloads/SendRack-0.7.23-fcm.apk over the existing ng.sendrack.test app. Do not uninstall or clear phone storage. The package version is 23, version name 0.7.23-fcm. The original signing certificate was verified before signing; no key was replaced.

Deploy the merged apk-test-v0.7.0 commit on the existing Render service to activate the admin console and authenticated contact-photo response. Refresh /admin after deployment. No hosting-plan, provider-key, database-reset or real payment changes are required for this UI release. The previous website video section and notification recovery remain included.

## Verification

99 PostgreSQL server/API tests passed without skips, including notification recovery, route direction/identity/payment gates, regional authorization, contact ownership, private profile-photo access and migration checks. The signed APK was built with the Android SDK and retained certificate. Package metadata, bundled opening artwork, tested frontend module hashes, native SMS intent, Firebase receiver and registration worker were verified.

Browser and extracted-APK checks cover the reference layouts at phone/tablet/desktop widths, history-before-current ordering, horizontal cards, live route quotes, history filters, wallet/profile access, dark mode, assigned call/SMS links, two-session create/accept/collect, map-origin handling, quiet refresh, daily route reconfirmation and notification login/deep links. Owner route/pricing workflows, admin layout/focus preservation and finance UI checks also passed. Screenshots use synthetic test records and controlled blank map tiles; they are not production users, live road routing or physical phone execution.

## Remaining external setup

Google Maps/Navigation SDK is not activated: Google Maps billing and appropriately restricted keys have not been supplied. The app uses the existing configured map provider and real recorded locations. It does not fabricate road routes, distances, rider movement or estimated arrival times. External directions remain available from the existing pickup workflow.

Native TestFlight is not produced by this Linux Android build. The active Apple membership still needs an App Store Connect app/bundle registration and an authorized macOS/Xcode signing/build setup. An APK cannot be installed on an iPhone.

Render is blocked by this workspace's network policy and no Render credential/connector is available. Source merge is not proof of live deployment. Physical-device Firebase receipt and real phone call/SMS handling still require a phone test after deployment.

Retained signer SHA-256: d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5. The APK SHA-256 checksum is alongside the download.
