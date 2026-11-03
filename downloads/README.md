# Try TrackShip NG 0.2.0

Download the updated APK from the repository's `apk-test-v0.2.0` branch. Android 8 or newer and a current Android System WebView are required.

## Updating the first APK

Install this APK over the previous one. The package name and signing identity are unchanged; Android should offer an update. Your shipments are retained. The updated app asks you to complete the new onboarding. Do not uninstall the previous version just to see onboarding. Export a backup first if you ever need to uninstall or clear app data.

## Vendor journey

1. Open TrackShip, continue through the introduction (or skip it), and choose **I'm a vendor**.
2. Enter your business name, your name and Nigerian phone number.
3. Enter your pickup city and address, then create your vendor profile.
4. Tap **Start sending**. Your vendor dashboard opens.
5. Use the **+** tab to create a package: package details → delivery details → service and rider → review → confirm.
6. Open the package to record delivery checkpoints and share a status message via WhatsApp.
7. Tap Packages to search your delivery book and filter your package history.

## Rider journey

1. Choose **I'm a rider** on the role screen. If you are already in the vendor workspace, open **Profile → Switch to rider**.
2. Enter your name and Nigerian mobile number.
3. Enter your delivery city, vehicle type and registration (registration is not needed for a bicycle).
4. Create your profile and tap **Go to my deliveries**.
5. Rider Home shows your availability and assigned deliveries. The rider workspace has no vendor shipment-creation form.
6. On the same phone, vendor shipments assigned to the rider profile's phone number appear automatically. Open one to record checkpoints and call the recipient.
7. For another phone, the vendor needs a connected tracking service. The vendor shares a private dispatch link; paste that under the rider app's **+ → Add delivery**. Do not share private dispatch links with customers.

You can switch between already-created vendor and rider workspaces from Profile without repeating onboarding. Profile also has **View introduction again**, backup export and backup restore.

## What to expect in this test version

- Onboarding creates local device profiles. It does not verify identity, phone ownership or vehicle documents. There is no SMS verification or password login.
- Delivery updates are manual. The map is a clearly labelled route illustration, not GPS tracking. **Open delivery address in Maps** opens a real external map search.
- Service choices record preferences. They do not book a carrier, guarantee an ETA or collect payment.
- Phone-only shipment creation, assigned deliveries on the same phone, status sharing and backups work without a hosted service.
- Cross-phone tracking and rider handoff require a public HTTPS tracking service. None is deployed or preconfigured in the APK. The included service and complete cross-device flow were tested locally using isolated browser profiles.
- Keep backups private: they contain customer data and access credentials. Uninstalling or clearing app data removes local profiles and shipments.
