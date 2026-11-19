# SendRack 0.7.34-fcm

Fixes:
- Clear signup intent after account entry, logout and session expiry so existing users return to login.
- Label post-ID email verification as the final signup step, with a way to use an existing account.
- Resume pending signup after a WebView reload using profile metadata and the existing Android encrypted identity vault. Documents and document numbers are not placed in web storage. Pending profile metadata expires after 24 hours and clears after identity submission.
- Preserve PIN setup while unauthenticated signup/login is unfinished; completed accounts retain background locking and server session validation.
- Keep the previous-delivery selection visible and show recipient, phone and address immediately on the package step. Reset the selection for a fresh shipment/bulk item. A new quote and shipment reference are still required.

Validation:
- tests/signup-retention-ui.mjs covers vendor and rider registration, reload after identity, upload failure/retry, PIN completion, background lock and logout returning to login.
- tests/reference-redesign-ui.mjs checks immediate selected-address feedback, retained selection through redraw, delivery details on the next step, and existing UI workflows.
- Existing account and shipment logic tests: 19 passed.
- Firebase release build and signing use the retained ng.sendrack.test identity.

Limits: automated tests use controlled local providers and browser/native-bridge contracts. Physical Android lifecycle behavior and live email delivery require phone testing. This client-only change does not deploy the hosted website/backend.
