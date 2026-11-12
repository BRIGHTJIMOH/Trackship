# SendRack 0.7.9-fcm (build 9)

Source: b65dfa965beb681fe0307f239a7b23b5e4bfde07.
Package ng.sendrack.test; existing retained signing identity; backend https://sendrack-api.onrender.com. Install over the existing test app without uninstalling. Firebase and previous map/profile fixes retained.

Rider home no longer repeats Wallet/Nearby deliveries buttons, search, filters or the large empty-state card. Active jobs are independent of history search/filter settings. New offers are reachable from the notification bell, with plain-language offer/connection states. The startup mark is 60px rather than 112px and retains reduced-motion support. Accept controls support paid or held offers; the server remains authoritative.

Validation: signed APK assets executed in Chromium against isolated PostgreSQL-backed APIs. Checked rider home with/without jobs, offer navigation, wallet/profile/withdrawal, vendor creation/signup, splash sizing/reduced motion, and layouts at mobile/1366/1920 widths. Asset-source hashes, retained native bridge/backend, Firebase packaging and lock-aware notification entry passed. Android release lint and signature verification passed. Screenshots contain sample account data. No physical Android device or live push/map/Render verification. No backend pricing, database or hosting configuration changes.

Google road distances and ETAs are prepared in ../google-routing-plan.md; they are not implemented or activated. Project/billing are not configured. No paid Google requests or resources enabled.

SHA-256: 8532495b7b25194ddb69b654573bd4389fdaef8d399b00f987793c4373fc7d84.
