# SendRack architecture corrections

20 November 2026. This change implements the first safe correction stage from section 3 of the 19 November audit. It removes several growth hazards while retaining the legacy business-write guard. It does not certify two-million-user capacity or activate paid hosting.

## Changes against the findings

| Finding | Implemented correction | Remaining work |
| --- | --- | --- |
| A Global write serialization | Automatic rider GPS writes use independent, short PostgreSQL transactions and row locks. Latest positions live outside shipment JSON. Vendor snapshots and worker claims no longer acquire the legacy global write lock. | Shipment creation, custody, authentication and finance still retain the legacy guard. They need explicit per-resource transaction and durable side-effect migrations before that guard can be removed. |
| B Full shipment scans | Transactional shipment and assignment projections, geography/route indexes, indexed matching, rider-specific GPS and logout queries, and stable vendor history cursors. | Shipment events still reside in the compatibility JSON payload. Fully normalized append-only history and deliberate client-cache limits are later migration work. |
| C Identity images in matching | Matching constructs only the small geography/vehicle profile. Authentication and account queries omit encrypted ID columns. Identity review still requires its existing authorization and audit. | Encrypted documents remain in PostgreSQL. Private object storage and a verified encrypted migration are required before removing their database copies. |
| D Polling writes and retry traffic | Authenticated read-only dispatch feed; legacy sync remains compatible. Visible-page polls use jitter, no overlap and exponential backoff; reconnect resets the delay. | No new SSE/WebSocket service or iOS background push was added. Older APKs keep their old polling schedule until updated. Shared rate-counter updates are operational writes, not business materialization. |
| E Admin and map scans | SQL filters, counts and pagination; regional scope applied before loading records; map reads at most 500 active records and explicitly reports truncation; associated sessions and extension records are scoped to that set. | Very large reporting aggregates may need incrementally maintained summaries. The map is a bounded recent operational view, not an unlimited fleet export. |
| F Notification throughput | PostgreSQL SKIP LOCKED claims, bounded provider concurrency, shared provider quota, retry jitter, expired final-lease failure handling, lease-aware acknowledgements and a separate worker command. Existing inbox and delivery tables remain the durable outbox. | Worker hosting, real provider quotas, queue-age alerting and real-phone receipt require operational verification. Provider delivery is at least once under a crash; opaque event IDs retain client deduplication. |
| G Infrastructure isolation | Public website/app/admin assets bypass database request acquisition, use asynchronous cached reads and ETag revalidation. Private API responses remain no-store. | CDN publication, paid plans, multiple API instances, database failover/PITR and restore drills have not been provisioned or demonstrated. |
| H Multi-instance controls | Shared SQL rate windows, explicit proxy trust, server-generated request IDs, admission limits, separate identity-upload admission, safe failure logs and owner-only runtime metrics. | Trusted ingress addresses, centralized metrics/log retention and SLO alerting must be configured for the real hosting environment. |

## Data and compatibility

`shipment_index`, `shipment_assignments` and `rider_match_index` are operational read models. Database triggers keep them synchronized with every insert/update/delete of the legacy shipment and rider tables, including old application writers. The initial backfill runs in batches of 250 and verifies shipment row counts before marking cutover complete. It is restartable. It does not discard shipment JSON, documents, payments or earnings.

`rider_location_state` holds one current position/consent record per shipment. New GPS observations cannot replace a newer observation. Reads attach this state only for the appropriate current rider/leg and an active session. Terminal deliveries, logout and changed custody suppress unauthorized coordinates. GPS does not rewrite shipment/event JSON or materialize delivery notifications.

The SQLite importer recognizes the new tables. It imports latest location state and rebuilds the derived projections from imported source rows. Operational rate windows and backfill markers are not imported. Empty-target, encryption-key, checksum and rollback checks remain enabled.

A previous manual Refresh regression in the owner pricing editor was also found and fixed: Refresh preserves an unsaved pricing draft rather than pairing it with a fresh server revision.

## Bounded responses

- Vendor shipment history: default 100, maximum 200 per page, keyset cursor ordered by creation time and ID. Owner scoping remains required on every page. The web history view can load the next page explicitly.
- Owner/regional shipment and user lists: 50 per page. Counts and region filters execute in SQL.
- Settlements/payment lists: capped at 100 per page at the API. The console exposes Previous/Next controls for these pages.
- Rider offers: at most 200 recent open candidates from the rider's selected routes, followed by the existing identity, vehicle, capacity, direction and payment checks. This is a bounded recent-offer window; a fully cursor-paged dispatch search is still required for very dense route populations.
- Operations map: up to 500 recent active shipments, with a visible truncation message. Full shipment browsing remains separate.

## Configuration and rollout

1. Keep this release in staging first. Take and test a database backup and preserve the current identity encryption key outside the web service. Do not rotate keys or recreate the existing database to apply this change.
2. Use Node 24 and `npm ci`. The current primary backend remains the Node HTTP/pg service, not NestJS/Prisma.
3. Run the expanded startup/backfill against the staging database and verify indexes and projections. For a large existing database, measure backfill time and schedule a controlled migration window: initialization takes the legacy migration/write lock. No zero-downtime guarantee is made.
4. Run `npm test` with `SENDRACK_TEST_POSTGRES_URL` set only to a disposable test database. Run the browser checks named below. Never load-test the production host.
5. Keep `PUSH_WORKER_MODE=embedded` for an initial pilot staging check. For a separate worker, run `npm run worker:push` with the same private database, identity and FCM project settings as the matching API release. Confirm startup and delivery processing before setting the API service to `PUSH_WORKER_MODE=api`. The worker requires valid FCM server credentials and shuts down its active batch before closing database connections.
6. Default worker settings are four concurrent sends, 40 claims per drain and a shared 50-per-second admission quota. These are application controls, not a promise of provider throughput or a verified quota. Set them within the real Firebase/project limits.
7. `DB_READ_POOL_MAX` defaults to 6; the guarded legacy writer pool stays at 1. Budget the sum across all API and worker processes against the database's real connection limit. Increasing replicas does not remove the remaining legacy business-write lock.
8. `API_MAX_INFLIGHT=200` and `API_IDENTITY_MAX_INFLIGHT=4` are per-process admission limits. Overload returns 503 with Retry-After. Provider and query timeouts remain separate budgets; HTTP requestTimeout is not presented as a full business-execution deadline.
9. Leave `TRUSTED_PROXY_ADDRESSES` empty until the actual ingress chain is verified. When configured, use exact direct upstream IPs. Forwarded headers from untrusted peers are ignored. Otherwise the socket address is used, which can group clients behind the same proxy.
10. Sign into the owner console and inspect `GET /api/admin/runtime` for request/latency buckets, event-loop lag, memory and database pool counters. Regional/mobile accounts cannot read it. Enable `REQUEST_LOGGING=true` for redacted request logs and connect them to your monitoring service. Queue age and mode are reported in Delivery setup's API response.
11. Verify two concurrent acceptances produce one winner, duplicate delivery/payment callbacks do not create duplicate credits, GPS/handoff races hide former-holder locations, revoked sessions fail, and a provider outage does not lose notification records. Verify actual notification receipt separately from FCM acceptance.
12. Only then deploy the tested commit to the existing Render source branch. Confirm `/api/ready`, `/api/version`, owner metrics, queue age and a consenting vendor/rider phone test. Existing Android APKs remain compatible with the backend; a new APK is needed for the client-side polling/history changes.

The repository's free-plan Render Blueprint remains unchanged. An always-on plan, a second replaceable API instance, dedicated worker hosting, managed failover and tested backup restoration are account/operational decisions, not resources created by this patch.

## Verification evidence

The regression suite and focused architecture checks run against isolated PostgreSQL and local SQLite. The new cases cover stable/private history pagination, rebuilding projections, raw legacy updates, GPS without shipment rewrites, stale observation rejection, logout, asset availability during database failure, shared throttling, forged forwarding headers, poll backoff/cancellation, parallel notification claims and GPS progress while the legacy write guard is occupied.

Browser checks cover owner draft/focus preservation, quiet dispatch recovery across weak networks/account switches, and browser vendor/rider signup recovery. Physical Android/iPhone execution, live Render plans, CDN, real object storage, provider delivery and a production-scale load/failover test remain separate acceptance gates.

## Mobile appearance correction

All five gradient declarations were removed from the mobile stylesheet. Light screens use solid cream/white surfaces; dark screens use solid charcoal/card surfaces. Brand accents remain solid green/sage. Story text uses a uniform translucent scrim. The public website stylesheet was not changed. Vendor and rider browser checks switch through Appearance, verify backgrounds and pseudo-elements, and confirm that dark mode survives reload. Android test build 0.7.39 packages this change with the client architecture corrections.
