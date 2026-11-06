# Website layout and preview fix

## Findings

The old scene used a fixed 210 px cube positioned by percentage offsets. At mobile widths it also used `transform: scale(.85)` on the same wrapper animated with a different `transform`. The animation replaced that scale. At the midpoint of the animation, a 360 px viewport had projected cube faces reaching approximately 369 px; the scene ended at approximately 338 px. `overflow:hidden` on `.scene` concealed the out-of-bounds geometry by cutting off the parcel. Rotated orbit borders also exceeded the scene bounds.

At 1366 and 1920 px, Chromium did not reproduce root-level horizontal overflow. The old per-section 1440 px maximum backgrounds did create separate boxed regions on wide displays. The new layout uses full-width backgrounds, a consistent centered 1280 px content grid and `minmax(0, ...)` tracks so content cannot force grid expansion. No global overflow hiding or clipping fix is used.

The cube's faces and depth now share a responsive CSS size variable. Its wrapper is geometrically centered, so animation does not replace a required scale. Orbit width is bounded horizontally and its projected height fits wide tablet scenes. `.scene` has visible overflow; tests assert that its geometry remains inside it. The cycle is shortened from 7 to 5.5 seconds, with smaller smooth compositor-driven movement. Reduced-motion preference stops the animation and disables its transform hint.

## Product previews

`web/assets/product-vendor.jpg` and `product-rider.jpg` are screenshots generated from the actual SendRack app with fictional local sample records. They are not invented mock interfaces, endorsements or customer records. The website labels each preview as SAMPLE DATA, and alt text identifies the fictional content. Screenshots are lazy-loaded, sized explicitly and total approximately 90 KB.

Regenerate them with `node tests/product-previews.mjs`. This starts a disposable local fixture and creates only synthetic browser-local data. It does not read or write production records.

## Validation and deployment

- `node tests/marketing-layout-ui.mjs`: 1366×768, 1920×1080, 1093×768, 900×768, 801×768, 768×1024, 430×932, 390×844, 360×800 and 320×700. Checks balanced gutters, actual element bounds, no horizontal overflow, no cube/orbit clipping at nine phases, product asset loading, reduced motion, canonical routes and JPEG MIME types.
- `node tests/marketing-ui.mjs`: website/app navigation, retained storage, waitlist submission and owner listing, payment return, mobile layouts and motion preferences.
- `node --test tests/public-website.test.mjs`: canonical/compatibility routes, account continuity, waitlist consent/duplicates and owner-only access.

[Desktop/mobile screenshots and product previews](screenshots/layout-fix/README.md).

Only marketing HTML/CSS, two public JPEG assets, the static asset allowlist/MIME map, tests and documentation change. `/`, `/app`, `/admin`, waitlist behavior, tracking and payment routes remain intact. No database migration, environment change, Render resource/plan change, account rewrite or signing change is included. Deployment uses the existing `apk-test-v0.7.0` branch. Live verification remains subject to the session network policy; local Chromium viewport checks do not establish physical iPhone Safari behavior.
