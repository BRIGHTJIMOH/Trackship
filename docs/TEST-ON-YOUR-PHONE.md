# Try SendRack 0.7.0

Install over the existing app; do not uninstall. Your saved profiles, PINs, shipments and encrypted identity drafts stay in the same app storage. Look for the split-S logo and v0.7.0 badge beside the login wordmark.

The rotating startup logo stays visible for four seconds before login/signup. The separate owner web dashboard will be available at the hosted `/admin` address after Render is connected; see ADMIN-DASHBOARD.md.

This version prepares the app/backend for Render PostgreSQL and configurable MapTiler maps. The owner's hosting and merchant accounts are still being prepared; the distributed APK has no public backend address yet. Local signup/PIN access, shipment baskets, night mode and status sharing remain usable. A hosted service and provider setup are needed for public tracking links, remote accounts, actual payments and GPS sharing across phones.

Map display uses an origin-restricted public MapTiler key when the service provides one. Phone GPS supplies the location. Every current holder, including an interstate carrier, must explicitly share; the app does not pretend a parcel's location is known when it is separated from the tracked phone.

Customer tracking links need no SMS or signup. The current cloud signup and final-delivery verification still use the older SMS flow; replacing them with email/password and email delivery confirmation is pending. Provider tests are isolated; no real funds, GPS journey or SMS/email activation has been performed.

When the server address is ready, test a connected version on two actual phones and a separate customer browser, including location permissions, background sharing, internet loss, stale location expiry, handoffs and completion. See RENDER-POSTGRES.md and LIVE-TRACKING.md for setup and limits.
