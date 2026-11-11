# SendRack 0.7.8-fcm (build 8)

Source commit: 91537e3ee23da6ad43b529c738aafc96e6660c57.
Package: ng.sendrack.test. Backend: https://sendrack-api.onrender.com.
Signed with the existing SendRack Test identity; installs over build 7 without uninstalling. Firebase integration retained. No database migration or hosting configuration changes.

## Changes

- Compact neutral profile balance; balanced Appearance card and toggle, tested at 320, 390 and 560px.
- Short location messages for users; operational details remain on the admin map.
- MapTiler TileJSON authorization probe rejects HTTP-200 error images and HTTP-403 failures before displaying provider tiles. Basic OpenStreetMap pilot fallback retains map position and makes the degraded provider explicit in admin diagnostics. Restrictions remain enabled and only the site origin is sent as referrer; no private tracking path or credentials are sent.
- Retry reloads server configuration; deleting PUBLIC_MAPTILER_KEY selects OpenStreetMap across every screen. No cached key retained after configuration change.
- Owner-confirmed static pickup pins before rider acceptance, clearly distinguished from holder GPS and viewer location. Customer tracking shows only an approximate pickup area while the parcel remains with the vendor. Missing pins are explained; never invented.

## Verification and limits

75 server tests passed, zero skipped. Four-view map provider/location browser tests and real cross-origin referrer experiment passed using controlled provider responses. Signed APK assets executed in Chromium against isolated PostgreSQL-backed APIs; current profile/Appearance screenshots are from those APK assets with sample account data. Release lint, Firebase asset checks and retained signing-certificate verification passed.

No physical Android device testing or live Render/MapTiler/OpenStreetMap tile verification: the managed environment proxy denies those destinations (CONNECT 403). Controlled tile tests must not be read as evidence of live map availability. The deployed key and Render environment could not be inspected. This release handles rejection; it does not claim to repair the live provider account.

OpenStreetMap is a basic pilot fallback, not a provisioned commercial capacity guarantee. A production provider change needs account/billing review and integration. No paid service provisioned. Registration options: https://console.cloud.google.com/google/maps-apis/onboard and https://account.mapbox.com/auth/signup/ . Never commit private credentials.

APK SHA-256: 81953f5366a69eff15ff44280f0e8a164a1f4965ddff38088d492a8f308ca94d.
