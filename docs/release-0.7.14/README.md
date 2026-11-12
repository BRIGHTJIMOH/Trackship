# SendRack 0.7.14-fcm (build 14)

Source: b3cea679a7edac3cde15451c2deb6014613c66ee.
Package ng.sendrack.test; retained signing identity; backend https://sendrack-api.onrender.com. Update the existing test installation without uninstalling or clearing records.

## Pickup journey

Accepting a funded, matching pickup offer now opens Go to pickup. Show the vendor pickup address, authenticated Call vendor contact and directions. A confirmed static pickup pin opens the inline map automatically. Missing pins are explained; address-based directions are available without inventing coordinates. Directions open Google Maps externally; this does not activate Google Maps Platform billing/API integration. My location remains separate and no background GPS sharing starts from acceptance, directions or calls.

Accepting reserves the job; the parcel remains with the vendor. The rider checks the parcel, confirms receipt with the required checkbox and taps Collect parcel. Only the existing authorized server pickup action records collection and changes custody to the assigned pickup handler. Confirmation survives background rendering, failed requests do not advance local custody, and reopening an accepted pickup from Home returns to the pickup screen. Existing interstate/intrastate, funding, OTP, handover and record rules are preserved. No schema, provider credential, Render resource or plan changes.

Fix shared Leaflet overlay SVG sizing so application icon CSS cannot shrink the pickup/viewer marker layer.

## Verification and limits

Signed APK browser suite and exact source/Firebase checks passed, as did Android release lint/signature verification. Two independent browser sessions using extracted APK assets tested home acceptance -> pickup map -> vendor call/directions with vendor custody retained -> explicit confirmation -> one collection event -> pickup-handler custody. Controlled frontend tests covered missing pin/address fallback, no accidental GPS sharing, retained confirmation, collection failure and retry. Nine server workflow tests passed without skips, including interstate/intrastate handovers and authorization. Map overlay geometry sizing was verified.

Screenshots use sample accounts, a sender-confirmed sample pickup pin and controlled neutral tile responses. They do not demonstrate live road tiles. No physical Android navigation/call/collection or live Render/FCM/bank verification; the environment blocks live Render/provider access. Real funding is still required before acceptance; nothing is marked paid or verified automatically.

SHA-256: b3e2efc690e7b52d791fbc6677622353d851c975e6ce34eeac677df885d9d663.
