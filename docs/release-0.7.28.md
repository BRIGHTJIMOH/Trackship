# SendRack 0.7.28 test release

Home: compact Add money/Withdraw actions; remove redundant Wallet & activity footer (wallet remains accessible through the balance and Profile). Rename Drop off to To deliver: this filters parcels past pickup and does not confirm delivery. Rider order is shortcuts, Incoming deliveries, My deliveries.

Create shipment: Use previous delivery copies the signed-in vendor's confirmed delivery contact/address/route details. Package fields remain new; old tracking credentials, payment, quote and date are excluded. Current route pricing and final consent remain required. Removed routes require a new selection. Existing basket drafts are retained privately but bulk UI/submission is deferred. Receive remains deferred.

Admin: routes grouped and filtered by pickup state, with Delete confirmation. Deletion hides the route from new bookings/offers and retains historical shipments, prices and assigned work. Revision conflict, owner/region authorization, CSRF and audit checks remain enforced. Regional managers can delete only their assigned local routes.

Notifications register automatically after authenticated login and do not require manually placing a location pin. Incoming matching still requires today's route/availability, approved identity and compatible area/vehicle. Android notification permission is required; live GPS is separate and starts for assigned work. Physical locked-phone FCM receipt and live Render deployment cannot be verified in this workspace.

Validation: 109 server tests passed, including route deletion, regional restrictions and reuse whitelist. Browser route state/delete checks and session/home checks passed. Signed APK retains the existing test certificate. The full extracted-APK browser suite passed, including two-session create/accept/collect, notification tap login, account isolation, map origin and network recovery checks.

Deployment: deploy the merged apk-test-v0.7.0 commit on the existing Render service; install the signed 0.7.28 update over the previous test app. This workspace has no Render deploy credentials.
