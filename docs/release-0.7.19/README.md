# SendRack 0.7.19-fcm: unpaid test accept → pickup → collect

After the backend update is live, open Admin → Delivery setup → Enable test deliveries without payment. This owner-only, CSRF-protected, audited switch is off by default and persists in PostgreSQL/SQLite. It applies to eligible existing and new unpaid Created shipments without requiring per-shipment approval. Install build 19 on the testing phones so offers show Test delivery and allow Accept delivery while owner test mode is enabled.

Accepting atomically records a zero-payment test simulation and reserves the job; custody stays with the vendor. The existing pickup screen opens with confirmed pin/address directions and Call vendor. The rider inspects the goods, checks the receipt confirmation and taps Collect parcel; only then does custody move to the rider. Final customer OTP and interstate handoff safeguards remain.

No cash is collected and no deferred real payment is implemented. Simulated earnings remain non-withdrawable. Existing checkout references/payment rows, wallet holds, live funding/provider configurations, removed records, mismatched or identity-incomplete riders cannot use this test exception. Turning the switch off restores upfront-funding requirements for unpaid offers; existing accepted test jobs can finish as test jobs. The original per-record Enable test delivery control remains available.

Adds dispatch_test_settings and includes it in the SQLite import allowlist. Deployment initializes the table with no enabled row; no bank, secrets, hosting-plan or real-money setting changes.

Validation: 85 server tests passed without skips, including owner/CSRF protection, test-mode acceptance with zero payment, vendor custody until collection, live-checkout protection, switching off and migration. Admin browser checks exercised enabling the switch. Extracted APK browser checks covered unpaid acceptance, pickup navigation, both call buttons and explicit collection using separate vendor/rider sessions. Zero payment rows, simulated test mode and amount zero were asserted. Existing publishing/history/route/recovery and map checks passed. Final package/assets/Firebase/signature checks retain signer SHA256 d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5.

Install over ng.sendrack.test without uninstalling or clearing storage. Physical phone/Firebase receipt and live Render rollout are not established by local browser tests. Render access remains blocked from this environment; merging the deployment branch does not itself prove a successful hosted rollout.
