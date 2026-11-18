# SendRack 0.7.26 Firebase test APK

PIN login now checks the saved online session before opening Home. Missing, expired, revoked or suspended sessions require online sign-in; a failed network check leaves the user on login. A 401 from the currently active account locks the dashboard, clears its invalid token and retains its saved shipments. Responses from other accounts or origins cannot lock the current account through this handler.

All vendor shipment cards use one action footer. Unconfirmed sends show a compact status and Retry send instead of a long paragraph below Track location. The app does not claim that these deliveries were received by the server. Existing idempotent retry behavior is preserved. Redundant sign-in/sync banners are removed from Home.

Wallet balance and Wallet & activity now form a separate card above New delivery/Delivery offers and Track package. Contacts are not rendered for an unsent vendor shipment or without a session. Missing pickup-pin status is shortened without fabricating a location. The original bicycle courier illustration and retained signing identity are unchanged.

## Deployment order

Deploy the matching server source first: login uses the new authenticated `GET /api/accounts/session` endpoint. Then install `downloads/SendRack-0.7.26-fcm.apk` over SendRack Test. The current Render service is `sendrack-api`, source branch `apk-test-v0.7.0`. Render deployment cannot be triggered or verified from this workspace. The APK uses the same backend and Firebase package as before.

## Checks

100 server tests passed, including both roles' valid, missing, expired, suspended and revoked sessions. Browser checks cover blocked disconnected login, network failure before login, active-session revocation without draft loss, three failed-send cards and wallet placement. Reference/responsive and signed-APK asset checks exercise the packaged code against controlled local APIs. These checks do not establish physical Android execution, live Firebase receipt or a live Render deployment.
