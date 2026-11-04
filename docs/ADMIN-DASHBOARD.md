# SendRack owner dashboard

The owner dashboard is a separate website at `/admin` on the same hosted service as the tracking API. It is not a rider/vendor account or an extra screen in the APK. No live dashboard URL has been activated yet. The supplied HTML and screenshots were design references; their bundled scripts and sample figures are not used as backend records.

## Private owner access

Set `ADMIN_USERNAME` (default `owner`) and a unique `ADMIN_PASSWORD` of 14–200 characters privately in Render's environment settings. There is no default password, public owner signup or password stored in the APK. Never paste credentials into chat, source control or screenshots. The Blueprint requests this private password when applied.

Alternatively set `ADMIN_PASSWORD_HASH` instead of the plaintext environment value: `scrypt$<32 lowercase hexadecimal salt characters>$<64 lowercase hexadecimal hash characters>`. Use Node scrypt with the salt text, output length 32, N=32768, r=8, p=1 and maxmem=64 MiB. An adequately configured `ADMIN_PASSWORD` takes precedence.

Open `https://YOUR-SERVICE/admin`. Production requires HTTPS. Owner sessions use an HttpOnly, Secure, SameSite=Strict cookie, expire after eight hours, and require a CSRF token for changes. Login attempts are limited. Log out using the sidebar. Changing the private password/hash or admin key invalidates existing owner sessions. If you forget the password, replace it privately in Render and restart the service; there is no email recovery yet.

## What you can manage

- Overview and analytics: actual synced shipments, custody status, users and payment totals, with test and live payments shown separately.
- Shipments: search, status filters, private delivery details, custody history and the latest reported GPS fix/time. A stale fix is labelled; the dashboard cannot locate a parcel without the current holder's phone sharing location.
- Users: vendor/rider profiles, private identity submissions, approval/rejection and account suspension/restoration. Identity views/reviews are audited. Evidence changes invalidate an older review. Manual review does not independently verify a government document. Suspension revokes server sessions; it cannot erase a device's offline records.
- Routes: create origin/destination city/state pairs, optional reverse journeys, pickup/carrier/last-mile fees and active/paused status. Intrastate routes use one pickup rider fee; interstate routes use all three handler fees.
- Pricing: set a platform percentage, an Express surcharge and whether new shipments must use an active owner route. The server calculates the final price; the platform fee is not credited as rider earnings. Prices on existing shipments remain fixed when a route changes. Concurrent stale edits are rejected.
- Settlements: inspect actual payment/earnings records and provider references. This is read-only; there is no button to manufacture a successful bank payout. Provider activation and funding are still required.
- Activity log: paginated owner route/pricing/account/identity actions. Audit summaries exclude ID numbers and document contents.

Individual vendor shipments select an active route and receive a server quote. CSV imports match route cities/states automatically; optional `routeName` disambiguates and `service` selects Standard or Express. Quotes are checked again when a shipment is created. A changed quote must be reviewed. If route enforcement is off, legacy manual pricing remains available; turn enforcement on after configuring routes.

Only records synced to this backend appear. Offline shipments saved solely on a phone are not automatically visible. No demo users, fabricated totals or fake payout records are seeded. SQLite is supported locally; the prepared hosted configuration uses PostgreSQL. Owner routes, rules and audit records persist in that database and are included in the SQLite-to-PostgreSQL importer.

## Local checks

With Node 24, install dependencies and provide environment settings privately, then run `npm start` and visit `http://127.0.0.1:3000/admin`. Use `npm run test:admin` for the isolated owner/vendor browser checks. Its generated screenshots contain fictional test records and are not production activity.

Read RENDER-POSTGRES.md before deploying. The paid Render plans have not been applied, and payment, SMS/email and real Android road testing remain pending as recorded in VALIDATION.md.
