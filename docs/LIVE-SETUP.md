# SendRack live setup

Use [RENDER-POSTGRES.md](RENDER-POSTGRES.md) for the current hosting/database procedure and [LIVE-TRACKING.md](LIVE-TRACKING.md) for GPS and map configuration. The current Blueprint provisions PostgreSQL; earlier SQLite persistent-disk deployment instructions are superseded.

The owner is preparing Render and Paystack accounts. No deployment, live payment, bank payout or provider account activation has been performed. Review paid resource plans before applying the Blueprint. Add secret values privately in the service environment.

1. Review/deploy `render.yaml` from the prepared branch. Confirm `/api/ready` returns a real PostgreSQL check.
2. Preserve existing identity encryption/admin keys and database backups. Use the checked SQLite importer only if an existing hosted backend database needs moving; phone-local JSON is a separate format.
3. Add a Paystack test key and configure `/api/payments/webhook`. Verify hosted checkout, amount/NGN/environment matching, signed webhooks and retries before enabling real charges.
4. Configure an optional origin-restricted `PUBLIC_MAPTILER_KEY`. Test carrier/rider GPS on real devices and a separate customer browser.
5. Rebuild the APK with the actual HTTPS backend origin once known. Never bundle database, Paystack, identity or operator keys.
6. SMS is not required for public customer tracking links. Cloud phone verification and recipient delivery OTP still use the compatibility SMS provider; email-based replacements are pending. Do not present the current backend as an activated SMS-free account/delivery-confirmation service.
7. Keep bank payouts disabled until identity review, payout account resolution, provider permissions/funding and business exception handling are checked. An internal earnings ledger is not regulated escrow. Provider-supported payment holding, refunds, disputes and reconciliation need operational approval and verification before real funds.

Operator identity review endpoints remain protected by `TRACKSHIP_ADMIN_TOKEN`: `/api/admin/vendors/:id/identity` and `/api/admin/riders/:id/identity`. GET reads decrypted submissions; POST accepts approved/rejected status. Protect access and establish retention rules before collecting real documents. Uploads alone do not verify government identity.
