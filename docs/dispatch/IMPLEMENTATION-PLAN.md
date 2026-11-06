# Dispatch extension plan and baseline

> Historical phase-one checkpoint. The stacked [phase-two preview](PHASE-2.md) adds HTTP/UI/worker integration; it remains blocked on production.

Baseline inspected: owner-designated deployment branch `apk-test-v0.7.0`, commit `00f45703645acdd31d4cf662f48dfc6ddf6c0740`. PR #6 (route types and phone journeys) is merged. Email-verification PR #4 remains separate. Existing website/waitlist/admin/free resources are retained.

Reviewable phases:

1. Versioned server state, durable events/outbox, location-qualified dispatch and authenticated handovers; dedicated recipient-contact and delivery-code flows; strict privacy and idempotency tests.
2. Vendor/rider/customer/admin interfaces and native/browser notification integration, FCM/APNs provider adapters and worker configuration. Native signing and physical-device validation remain activation dependencies.
3. Staff permissions/MFA, masked/audited identity access, encrypted backup/restore tooling, retention/recovery/incident procedures and operational validation.

No provisioning, migration of active shipments to a new state machine, fake positions, verification bypass or replacement signing keys. The new workflow requires explicit activation after account/provider configuration; old shipments keep their state/history/payment/earnings records. Provider delivery is at-least-once with event IDs and durable deduplication, never a promise of exactly-once external push/SMS delivery.

Baseline includes payment confirmation, atomic offer acceptance, service-area matching, identity encryption, scoped sessions, custody checkpoints, consented per-job GPS, customer tracking, private OTP and exactly-once ledger credits. Gaps to address include recent-GPS discovery, approved-ID eligibility, intended-recipient handovers, customer contact proof/OTP timing, outbox retries, native push and staff operational controls.

## Phase-one result

The v5 module, encrypted outbox, FCM/APNs adapters and backup utility are implemented and exercised by simulated/local tests. The module is deliberately not imported by the production server and no activation flag exists yet. Only the existing v3 preview/completion authorization fix changes current runtime behavior. This is a draft foundation PR, not a claim that the new workflow, staff MFA, native push or production backup is activated. See [setup and rollout](SETUP-AND-ROLLOUT.md) for exact settings, policies, remaining phase work and deployment gates.
