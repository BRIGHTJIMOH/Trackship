# MapTiler origin-restriction / missing-referrer fix

Based on deployed-branch source merge `a361f89ffebc4e25627acb99448fd8c33833035b`; live Render commit cannot be inspected from this environment.

## Confirmed source issue

`server/server.mjs` sends `Referrer-Policy: no-referrer` globally. All first-party Leaflet tile layers were inspected (excluding the bundled unmodified Leaflet library):

- `web/features.mjs` — shared app/customer tracking map.
- `admin/live-map.js` — owner Live Operations Map.

Neither previously specified `referrerPolicy`. Leaflet 1.9.4 creates image tiles with its default `crossOrigin: false`. Ordinary cross-origin image GETs therefore send no Origin, while the document's no-referrer policy suppresses Referer. This removes the information used by origin-restricted MapTiler display keys, consistent with the reported tile 403. This is source and controlled-browser confirmation, not confirmation of the current production provider response.

## Narrow change

Both layers now set `referrerPolicy: 'strict-origin-when-cross-origin'`. For HTTPS MapTiler requests from SendRack HTTPS pages, this sends only the site origin, such as `https://sendrack-api.onrender.com/`, never a tracking token, private path, query string or fragment. HTTPS-to-HTTP downgrade referrers are suppressed by the browser. The global no-referrer response header stays unchanged, protecting other outgoing requests/navigation. CrossOrigin is not forced and no request header is spoofed.

MapTiler's configured origin restrictions stay enabled. No key, allowlist, database, Render plan or resource is changed. The Android WebView's existing virtual origin remains a separate allowed-origin consideration for a later rebuilt APK; this server/web source patch does not modify an already installed APK's bundled JavaScript.

The admin now reports tile loading/failure independently of shipment-feed connectivity. A successful feed update cannot overwrite a tile-error message. New successfully loaded views can recover. A "Connected" feed banner is not tile verification.

## Evidence

Run `node tests/map-referrer-ui.mjs`:

1. A real local cross-origin HTTP receiver enforces an origin-restriction stand-in. Before: no Referer, no Origin, HTTP 403. After: origin-only Referer, no Origin, HTTP 200 with a decoded PNG. The source page contains synthetic private tokens and query parameters; neither reaches the receiver.
2. Actual app and admin Leaflet layers run in Chromium with intercepted MapTiler requests; their generated image attributes and outgoing headers are checked. These provider responses are controlled test doubles, NOT real MapTiler responses.
3. Admin controlled 403 remains visible across successful feed refresh and recovers on subsequent successful tile loads.

[Recorded browser evidence](browser-evidence.json) · [admin with controlled test tiles](admin-controlled-tiles.png).

Server suite: 58 passed, 4 environment-dependent skips, 0 failures. Existing operations UI suite passed with 2,000 static sample shipments, state retention, reconnects and no overlapping feed requests. No physical-device or live provider verification is claimed.

## Live verification still required

The managed environment reports enforced restricted networking with no custom allowed hosts. HTTPS attempts to BOTH `sendrack-api.onrender.com` and `api.maptiler.com` were denied by the proxy at CONNECT with HTTP 403. This is not a MapTiler application response and cannot validate the configured key. No Render connection, provider credential binding or network-configuration editing tool is available in this session. Do not disable MapTiler restrictions to work around this environment limitation.

Required environment network additions: `sendrack-api.onrender.com` and `api.maptiler.com` using the supported environment configuration interface. Keep existing package-manager hosts and policy. No credential needs to be pasted into chat.

After merging/deploying, check actual browser Network entries on the real HTTPS site:

- `/api/version`: confirm runtime commit.
- `/api/capabilities`: MapTiler selected; do not publish keys or tracking tokens in diagnostic exports.
- Tile request: actual `api.maptiler.com/maps/streets-v2/...png` GET returns HTTP 200, image content type and a visible/decoded tile.
- Request `Referer` is exactly the site origin, no private path/query; lack of `Origin` is normal for these image GETs.
- Check customer tracking and authenticated admin independently. Preserve restrictions for the correct real website origin and, where applicable, the existing Android asset origin.
- Test an actual rejected tile separately from a successful feed, then recover by loading a fresh view after correcting configuration. Do not infer working tiles from a feed banner.

This branch is prepared as a focused PR to `apk-test-v0.7.0`, separate from marketing PR #11. It has not been deployed here.
