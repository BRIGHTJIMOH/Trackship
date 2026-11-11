# SendRack 0.7.5 review

## Changes
- Compact grouped profile overview: balance and activity, profile details, security/login, identity and appearance. Editing and email linking remain on separate screens; no financial ledger is exposed to customers.
- Dark mode: pale home banner and all vehicle tiles use explicit dark foregrounds. Automatic contrast checks verify the affected banner/card text meets 4.5:1.
- Tracking: recorded prior events turn green, one current stage turns orange with a gentle beacon, future stages remain muted. Icons distinguish rider acceptance, collection, carrier handovers, travel and customer OTP. Delivered finishes green; cancellation stops the beacon. Reduced motion disables the animation. No custody event, OTP requirement or payment rule changed.
- Mobile map: a saved APK shipment without an active cloud session now obtains public map capabilities from its configured Render backend, not the virtual asset origin's nonexistent /api/capabilities route. Map sizing is refreshed for changing mobile containers; viewport and selection survive configuration refresh. Shipment selection now matches tracking actions. Completed/cancelled deliveries cannot display a live holder marker.

## Map configuration remaining outside this workspace
The existing restricted PUBLIC_MAPTILER_KEY must permit the actual browser origins, including https://sendrack-api.onrender.com and the unchanged installed APK virtual origin https://appassets.trackship.ng. Keep origin restrictions enabled. Leaflet sends only that origin in Referer, never private tracking paths or tokens; ordinary image GETs may have no Origin header. This repository does not spoof the Render Referer, proxy tiles, disable restrictions or silently bypass a rejected key. The installed-app tile error identifies the origin requirement. Removing PUBLIC_MAPTILER_KEY explicitly selects the documented OpenStreetMap pilot on every view. The same public key remains server-configured; no new secrets or environment-variable names are required.

Live Render access returned an environment-proxy CONNECT 403, not a MapTiler response. Therefore neither the actual key restriction list nor live provider HTTP responses were inspected or changed. A configured key and a connected GPS/API banner are not proof that tiles load.

## Validation
- All application tests; packaged APK Chromium flows including profile/security, night-mode contrast and same-shell wallet; signature and source hashes.
- All four map views with controlled tiles: origin-only headers, configured key rotation/removal, explicit provider/config errors, current viewport/filter preservation.
- Virtual APK-origin test with no cloud session: configured backend fallback, restricted-origin error, OpenStreetMap selection after configuration change, resize and no viewer-to-shipment GPS writes. This is a Chromium simulation of the WebView origin, not Android OS execution.
- Every stage of both custody chains through the actual customer endpoint/UI: completed/current/upcoming states, acceptance vs collection, delivered/cancelled states, dark mode and reduced motion.
- Owner browser flow: routes/pricing, authoritative vendor quote, profile email linking, private identity views, suspension, settlement/audit and logout.
- My location denied/retry/approximate/timeout/unavailable states across vendor/rider/customer/admin. No shipment location writes from viewer location.

APK version 0.7.5/code 5 retains ng.sendrack.test and the same private signing key/certificate. It updates the prior installation without uninstalling; original ng.trackship.app identity and local records remain untouched. Existing Render resources, free plans, environment settings and database records were not modified.
