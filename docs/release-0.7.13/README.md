# SendRack 0.7.13-fcm (build 13)

Source: c407116a83866fe69571c6fb658a6568c48ca50e.
Package ng.sendrack.test; retained signing certificate; backend https://sendrack-api.onrender.com. Update the current test installation without uninstalling or clearing records.

Incoming delivery offers now appear on the rider home screen above active/accepted deliveries and update automatically. No duplicate Wallet/Nearby shortcuts or home filters. A pending offer shows Awaiting vendor payment and explains that acceptance becomes available only after payment confirmation, instead of an unresponsive-looking disabled Accept button. Funded/held offers show an active Accept delivery control. In-flight requests say Accepting; failures remain visible on the card. A successfully accepted offer is immediately removed from incoming offers and saved in the rider's active jobs.

The user's screenshots already showed offers arriving but marked Awaiting payment. This release does not fund those jobs or connect a bank. All server-side funding/identity/matching/custody checks remain unchanged. No bank/verification bypass, backend/schema migration or Render plan/resource changes.

Signed APK assets were executed in Chromium against isolated PostgreSQL-backed APIs. Tested home empty -> pending incoming offer -> controlled test-provider funding -> ready home button -> visible simulated acceptance failure -> successful acceptance -> calls/collection -> active home job, without using the bell to accept. Existing app, map fallback, quiet polling/outage/account isolation, Firebase packaging, source hashes, Android release lint and retained signature checks passed. Screenshots use isolated sample data and test funding. No physical-phone/live bank/Render or FCM verification performed here; the managed environment blocks live Render access.

SHA-256: d75c46a6bedc2864b914855abc8ff0b2bd50ab656d68c155980399342263a65f.
