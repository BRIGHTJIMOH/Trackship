# SendRack 0.7.0 validation

- PostgreSQL: 39 automated checks passed against a real local PostgreSQL 18.6 server in isolated schemas. Includes all account/payment/custody/OTP/earnings tests, migration integrity and rollback, identity-key verification, public tracking privacy, and two API instances competing for a job and completing the same parcel.
- SQLite: 35 passed; four PostgreSQL-only checks skipped without a disposable PostgreSQL URL.
- Owner dashboard: isolated browser checks cover private login/logout, route creation/reload, authoritative vendor/CSV quotes, private shipment and identity review, suspension, real settlement records, audit pagination and a narrow mobile layout. The startup splash remains visible for four seconds. PostgreSQL checks include shared owner sessions and competing route edits across two API instances.
- Browser: mobile account/shipment/payment/custody flows use isolated provider responses. Public customer tracking selects the configured MapTiler display source without signup. No billable map request, real SMS or real money is used.
- APK: same package/signing identity, version 0.7.0 / code 12, Android 8+ / target API 35. Signed-APK screen checks use packaged assets and an older saved account. Cache controls and the visible top version badge remain.

A Render deployment, Render PostgreSQL 17 instance, real Paystack integration, physical Android GPS/background behavior, provider identity verification, bank payouts and a real road journey have not been tested or activated. Local PostgreSQL testing does not prove Render configuration/account readiness or production capacity.

The pilot serializes mutations with a shared advisory lock to protect JSON-record updates; load/per-shipment locking improvements are needed for high-volume production. Database migration snapshots data in memory and is intended for pilot-size sources. Vendor wallet funding, email-based account/recovery/delivery-code flows, regulated holding/escrow and full refund/dispute operations remain pending. Customer tracking links do not require SMS or signup.
