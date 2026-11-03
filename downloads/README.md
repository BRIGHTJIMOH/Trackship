# Try TrackShip NG 0.3.1

Install this APK over 0.2.0; the package name and signing identity are unchanged. Do not uninstall unless you first export a backup. Your existing shipments/profiles are retained.

## What you can test immediately

- The new Inter font replaces Poppins across screens.
- Tap **Log out** on either dashboard, or the logout button in Profile. On first use set a six-digit app PIN; use it to unlock a saved workspace when returning. Shipments are preserved. Rider online access must be phone-verified again after logout.
- Dashboard uses your business name or rider name.
- Profile → Night mode switches light/dark and remembers your choice.
- Vendor Home → Rider workspace makes the rider onboarding easy to find. A new rider proceeds to secure sign-on after local profile setup.
- Send package includes intrastate/interstate choice, pickup/destination states, per-delivery fee and interstate fee allocations.
- Vendor Home → Bulk shipments downloads/imports a CSV for up to 100 deliveries. No rows save if any row is invalid.
- New shipment details have payment controls and the expanded custody journey. Earlier shipments remain identified as legacy/manual test records.
- Profile exports/restores private backups.

## What needs the hosted service and provider accounts

Public customer links, secure phone sign-on, encrypted identity submission, delivery OTP, verified payments, remote custody handoffs, cross-phone live GPS and bank payouts need the activated backend. None is secretly simulated in the APK. The owner currently has no Render/Paystack accounts; see `docs/LIVE-SETUP.md` for those prerequisites.

The rider submits NIN/licence/home address only after secure server sign-on. The app does not save those fields to its local profile or backup, and does not claim they are verified merely because they were submitted.

## Connected delivery flow

1. Vendor creates and pays for a synced shipment.
2. Vendor shares the customer tracking URL with the recipient and the private pickup link with the first rider.
3. Rider verifies sign-on, submits identity details and imports their private dispatch link.
4. Accept delivery → customer sees rider acceptance while custody remains with the vendor.
5. Confirm collection → custody becomes the pickup rider’s. They can explicitly start GPS sharing.
6. Intrastate: start delivery. Interstate: offer to carrier → carrier accepts → starts journey → confirms arrival → offers to last-mile rider → last-mile rider accepts → starts final delivery.
7. The final rider requests the recipient’s OTP after reaching the customer. The customer reads it out only after receiving the parcel.
8. Correct OTP completes the delivery and records each handler’s earnings exactly once. Test-mode credits are marked as test credits and are not withdrawable.

GPS has a visible Android notification and Stop action. A fresh position is shown to vendor/customer; stale positions are hidden. Native location permissions/background operation still require a physical-device check. No measured ETA is invented.
