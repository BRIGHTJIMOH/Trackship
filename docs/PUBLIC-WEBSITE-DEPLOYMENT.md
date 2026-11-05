# Public website deployment

This reuses PR #1's marketing composition, CSS 3D scene and existing durable waitlist table, with orange/dark branding. It includes the admin quiet-refresh fix from PR #2.

## URLs after deployment

- Website: https://sendrack-api.onrender.com/
- Waitlist: https://sendrack-api.onrender.com/#waitlist
- Vendor/rider web app: https://sendrack-api.onrender.com/app
- Owner dashboard: https://sendrack-api.onrender.com/admin → Waitlist
- Compatibility: `/welcome` remains the marketing page; `/index.html` and `/sendrack-entry.html` remain app entrypoints.

The owner waitlist lists name, email, role, city and submission time, paginated in batches of 50. The public form requires explicit consent. Email normalization and a unique email key make duplicate submissions succeed without adding or overwriting an entry. Existing signups appear in the same owner view. No email delivery provider is configured by this change.

## Preservation

There is no database migration, deletion or account rewrite in this change. App local storage remains on the same origin with the same `trackship-v1` key. Existing cloud account/session behavior is retained. Tracking `/t/:token`, dispatch `/r/:token`, payment return `/payment-return` (including its query string), payment verification and webhook handlers retain their routes. Payment and dispatch return pages now link to `/app`.

`render.yaml`, environment values, signing configuration and both free plans are unchanged. Do not recreate or resync the Blueprint to deploy this source change. Deploy the merged commit on the existing `apk-test-v0.7.0` branch via the existing service's Auto-Deploy or Manual Deploy → Deploy latest commit. Keep its connected database and current environment settings.

## Checks

- `npm test`: 40 passed; 4 PostgreSQL-only tests skipped.
- `npm run test:ui`: vendor/rider signup, ID photo/background regression, returning users, account separation, customer tracking and payment workflows at `/app`.
- `npm run test:admin`: complete owner route/pricing/review/suspension workflow and vendor quotes.
- `node tests/admin-refresh-ui.mjs`: route/pricing drafts, focus, scroll, serialized refresh and transient errors.
- `node tests/marketing-ui.mjs`: `/`, `/app`, `/admin`, owner waitlist, payment return; 1440 px desktop, 390 px iPhone-size and 360 px Android-size layouts, storage retention, animation/reduced motion, screenshots.

Screenshots are in `docs/screenshots/public-website/`. These are local test records, not production customers. Phone layouts were tested with Chromium emulation, not physical iPhone/Android browsers. Live Render verification is still blocked by the session's outbound network policy; no production deployment is claimed.

After deployment, check `/api/ready`, all canonical URLs above, a real existing customer tracking link, existing account login and a consented waitlist signup. Confirm that signup in the owner's Waitlist view. Use the configured owner credentials; this change does not reset them.
