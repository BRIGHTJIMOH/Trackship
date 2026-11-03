# Try TrackShip NG 0.4.0

Install this APK over your existing TrackShip build; the package name and signing identity are unchanged. Do not uninstall unless you first export a backup. Your existing shipments/profiles are retained.

## What you can test immediately

- Choose **Sign up** for a new profile or **Log in** for a saved account; vendor and rider accounts have separate PINs and records.
- **Log out** fully exits either dashboard. The other role keeps its own saved account.
- Use the visible **Night/Day** button in the dashboard header.
- Create a shipment, then tap **+ Add another shipment** to build a basket without CSV. Review and create the basket together.
- Rider onboarding asks for government ID, including for bicycles; motor riders also need a driving licence. No vehicle-registration substitute or online/offline toggle remains.
- Android saves unsynced identity drafts encrypted; these drafts are not included in backups. Saving a draft does not verify identity.
- Profile exports/restores a private backup for the current account only.

## What needs the hosted service and provider accounts

Public customer links, secure phone sign-on, encrypted identity submission, delivery OTP, verified payments, remote custody handoffs, cross-phone live GPS and bank payouts need the activated backend. None is secretly simulated in the APK. The owner currently has no Render/Paystack accounts; see `docs/LIVE-SETUP.md` for those prerequisites.

The rider can prepare an encrypted identity draft on Android and submit it after secure server sign-on. The app does not save those fields to its local profile or backup, and does not claim they are verified merely because they were submitted.

## Connected delivery flow

1. Vendor creates and pays for a synced shipment.
2. Vendor shares the customer tracking URL. Eligible riders in the registered pickup area receive an offer; private dispatch links remain available for handoffs.
3. Rider verifies their own account, submits identity details and accepts a funded nearby offer. Vendor can be logged out.
4. Accept delivery → customer sees rider acceptance while custody remains with the vendor.
5. Confirm collection → custody becomes the pickup rider’s. They can explicitly start GPS sharing.
6. Intrastate: start delivery. Interstate: offer to carrier → carrier accepts → starts journey → confirms arrival → offers to last-mile rider → last-mile rider accepts → starts final delivery.
7. The final rider requests the recipient’s OTP after reaching the customer. The customer reads it out only after receiving the parcel.
8. Correct OTP completes the delivery and records each handler’s earnings exactly once. Test-mode credits are marked as test credits and are not withdrawable.

GPS has a visible Android notification and Stop action. A fresh position is shown to vendor/customer; stale positions are hidden. Native location permissions/background operation still require a physical-device check. No measured ETA is invented.

Area notifications require the hosted service. The open inbox refreshes every ten seconds; Android background checks run at least fifteen minutes apart and can be delayed by the OS. Instant push is not configured.
