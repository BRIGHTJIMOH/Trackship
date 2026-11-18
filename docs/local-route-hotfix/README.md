# Local-route matching hotfix

The live screenshot for TS-F45136EA shows route-direction-unavailable and zero notification records. Registration, rider identity, vehicle and pickup area are separate checks; this screenshot identifies the route check as the blocker, but the old combined code cannot identify its exact subcondition.

A local regression was reproduced before the fix: a current, available rider selecting the reverse option for an active two-way Zaria → Zaria route received no offer. Both directions have identical configured endpoints, but the old checker chose forward before checking the rider's declaration. The new checker considers both equivalent directions of that exact configured local route. Different-city routes still require their actual direction; one-way, unselected, unavailable, expired-day and outdated selections remain blocked. Identity, vehicle/capacity, payment and custody checks are unchanged.

Owner diagnostics now distinguish missing shipment route, no daily confirmation, paused/removed route, endpoint/type mismatch, unselected route, unavailable rider, opposite direction and changed revision. The console shows the required route name and the rider's selected route names. Counts remain scoped to the selected rider's role and account.

## Activate

1. Deploy the latest merged commit from apk-test-v0.7.0 to the existing Render sendrack-api service. This is a server/admin correction; keep the 0.7.27 APK and current Firebase configuration/signing identity.
2. Reload the admin page. Check matching for TS-F45136EA and the intended rider again.
3. If it says the rider has not confirmed today, has not selected the route, is unavailable, or selected an older revision, open My routes on the rider phone and confirm the required current route with availability on. No route is selected automatically on the rider's behalf.
4. Open rider Home after deployment so its automatic sync can recover an existing eligible shipment and notification. The shipment need not be recreated. Newly created matching shipments also use the corrected check while the rider phone is in the background.
5. If the remaining state is awaiting payment, use normal funding or the existing owner-authorized test mode where eligible. Unpaid status does not itself prevent a matching offer/notification record; acceptance still respects funding rules.

Validation: the new same-city reverse test failed on the previous code, then passed after the correction. All 106 server tests passed against isolated PostgreSQL. Browser tests verified plain-language diagnostics, required/selected names, and recovery of an existing shipment after selecting the local reverse direction. Live Render and physical-phone FCM receipt remain unverified from this workspace; deployment requires the owner's existing Render access.
