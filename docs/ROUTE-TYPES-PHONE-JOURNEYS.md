# Route types and website phone journeys

## Route setup

The route modal begins with a prominent Interstate/Intrastate radio selector. It initializes from the existing stored `deliveryType` when editing. Intrastate mirrors and locks destination state to pickup state, hides carrier/last-mile inputs and labels the existing pickup fee as one delivery-handler fee. Interstate enables destination state and requires different states, with pickup, carrier and last-mile fees visible. Percentage and flat platform fees are retained.

The header and action footer sit outside the scrollable form body, within a viewport-height-bounded modal. Save and Cancel stay visible while the form scrolls. Changing the selector does not discard typed fee values. Existing routes are not rewritten or migrated. On an explicit save, server validation rejects a type/state mismatch; intrastate quotes continue to use the single handler fee. Existing shipment quotes remain unchanged.

Legacy API callers that omit `deliveryType` retain inference from their submitted states. If a type is supplied, the server enforces it and rejects unknown types. Failed validation leaves existing records and revision numbers untouched.

## Website demonstration

The vendor sequence shows Create shipment → Shipment details → Customer tracking. The rider sequence shows Deliveries → Handoff details → Tracking. These are actual SendRack components/screens captured from a disposable local fixture with fictional SAMPLE-001 data. Tracking captures the real public delivery-update page; it makes no live-GPS claim.

Each journey has a realistic rounded phone bezel, camera detail, subtle depth/shadows and a small CSS tilt. Screens crossfade every six seconds while visible. Pause stops both tilt and automatic advancement. Choosing a screen pauses the journey and preserves control focus. Full-size sample links provide a readable original image. Vendor and rider controls are independent. Hidden/offscreen journeys do not advance. Reduced-motion preference disables tilt, transitions and autoplay, while manual selection continues to work.

The parcel cycle changes from 5.5 to 4.6 seconds with the existing smooth easing and limited travel. Heading sizing, line wrapping, card spacing and alignment are refined for desktop/mobile. All faces, orbits and phone frames remain within the page's centered layout.

## Verification

- `npm test`: 41 passed; four PostgreSQL-only checks skipped. Includes type/state mismatch rejection, old API compatibility, existing-route continuity and platform-fee preservation.
- `node tests/route-type-ui.mjs`: 1366×768, 1920×1080 and 390×844; selector/state locking, single handler fee, independent body scrolling, footer position and route save.
- `npm run test:admin`: complete existing admin workflow, including route/pricing forms, quotes, identity review and suspension.
- `node tests/admin-refresh-ui.mjs`: draft/focus/scroll preservation through refresh and transient errors.
- `node tests/phone-journey-ui.mjs`: ordered autoplay, independent controls, pause, manual selection/focus, full-size links, reduced motion and responsive frames/screenshots.
- `node tests/marketing-layout-ui.mjs`: 1366×768, 1920×1080, 1093×768, 900×768, 801×768, 768×1024, 430×932, 390×844, 360×800 and 320×700. Checks geometric containment through nine animation phases, no horizontal overflow, media loading, reduced motion and canonical routes.
- `node tests/marketing-ui.mjs`: `/`, `/app`, `/admin`, waitlist, account-storage preservation and payment return.
- `node tests/record-phone-journey.mjs`: produces the real 20-second animation recording using browser screenshots and FFmpeg.

[Review screenshots and recording](screenshots/route-journey/README.md).

## Deployment status

Prepared for review before deployment. No merge/deployment is performed for this change. No database schema, saved account/route records, Render resources, environment values, free plans, signing keys or provider settings were changed. `/`, `/app`, `/admin`, waitlist, tracking and payment callbacks retain their existing routes. The separate email-verification work is not merged as part of this change. Live Render verification remains blocked by this session's outbound network policy.
