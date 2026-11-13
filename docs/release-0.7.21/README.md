# SendRack 0.7.21-fcm: daily routes, compact history and regional operations

## Mobile

Both Home history shortcuts are small rows below the main content. Rider Work history opens completed/cancelled jobs; active deliveries remain on Home. Vendor history retains the latest all-shipment view and vehicle-first layout. Unsent shipment/sign-in recovery stays accessible without returning large pending cards to Home.

At the rider's first Home login for a Nigeria day, the background is dimmed/blurred and the card contains only Your routes today, route checkboxes, Start my day and Not today. The server filters choices to directions starting in the registered rider state; bidirectional routes expose only permitted starting directions. Selection/off-duty confirmation persists per rider and Africa/Lagos day across phones, locks, calls, logout and restart. Profile → Routes for today allows changes later. No route configuration or no selected working route means no open offers. Previous-day declarations cannot receive new offers until confirmed again. Assigned jobs can still finish. Route revisions continue to require renewed availability after a route changes.

Empty incoming-offer/setup copy is hidden from Home while its live update host remains active. Unchanged rider snapshots no longer trigger redraws; GPS-only changes update stored data without redrawing Home. Actual job/status changes continue to arrive, preserving scroll. Minute push-registration refresh remains automatic and does not require a screen reload.

## Owner and regional managers

Owner → Regional teams creates a manager with their own username, private password of at least 14 characters, and assigned Nigerian states (for example Kano or FCT Abuja). Managers use the same /admin address with their own login. The owner retains every region, global audit and financial control. No real manager accounts were created by the build/tests.

Regional scopes are checked on the server for every session/request. Managers see shipments whose pickup or destination touches their assigned states, local registered users and a scoped operations map. Other-region details, notification diagnostics, test deletion/settings, financial ledgers, settlements/payouts, platform/global pricing, identity reviews and account suspension remain owner-only. Route catalog information remains public to vendors as before.

Local pricing permission covers intrastate routes entirely within assigned states. Managers can create/edit these route prices; interstate and outside-region route edits and platform fee overrides are rejected. Existing priced shipments/holds are unchanged. Manager actions enter the owner's audit log. Edit access rotates the password and revokes existing sessions; Revoke access disables the account and its sessions. Manager lists expose usernames, states and status; password hashes and salts are never returned, and passwords are never logged.

New tables: rider_route_days, regional_admins, regional_admin_sessions. Startup creates them without erasing existing data; SQLite import supports them. Existing owner sessions and signing identity are retained. These are application dashboard identities, separate from wallet Finance/Support roles. No live bank/provider configuration or hosting-plan changes.

## Validation and installation

94 server/API tests passed without skips. Targeted authorization/daily/migration checks and the final regional ownership/redaction check passed. Existing owner UI, automatic rider pickup-to-OTP tracking and vendor history/scroll/layout browser checks passed. The extracted signed APK passed the vendor/rider UI, failed-send/retry, route selection, History, pickup/call/collection, map-origin and quiet dispatch suites. Additional extracted-APK checks covered daily confirmation, no repeat on same-day restart, next-day renewal, state filtering, Profile access, stable polling, compact history, owner manager creation and regional local pricing. Package/Firebase/source asset hashes and the retained signing certificate were verified. Screenshots show synthetic sample records.

Install the APK over ng.sendrack.test without uninstalling or clearing storage. Riders must update and confirm today's routes after the new backend is active. Owner should refresh /admin to see Regional teams. This release does not claim physical-phone execution or live Render rollout verification; Render access is blocked from this environment.

Source commit: 31530a8fbfa981690b9a24586c797cac936ae831. Package ng.sendrack.test, version code 21, version 0.7.21-fcm. Retained signer SHA-256 d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5.

APK 2ed5bd70379fbc43584ca84dc2cafc80465809a49873faae2ae9e1b0e7301629  downloads/SendRack-0.7.21-fcm.apk.
