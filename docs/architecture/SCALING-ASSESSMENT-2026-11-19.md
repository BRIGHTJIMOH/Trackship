# SendRack architecture and scaling assessment

19 November 2026 | Local source reviewed: commit 05fe853 | Scope: primary SendRack checkout, Android/WebView client, HTTP backend, database adapter, matching, tracking, push delivery and deployment configuration.

## Executive assessment

SendRack has a usable pilot foundation, but the current architecture is not ready to be certified for two million active users. PostgreSQL itself is not the main problem. Several application paths do work proportional to the entire customer/shipment population, and ordinary write requests share a single database-wide lock. Adding replicas alone will not remove that lock.

No defensible maximum vendor, rider or courier count can be given from the repository alone. Registration count, daily activity, concurrent sessions, active deliveries and tracking frequency are different workloads. There is no verified production capacity baseline, live infrastructure inventory or production-scale load test in this assessment.

The recommended course is to harden and restructure the current application in stages, retaining its delivery and payment rules. A wholesale framework rewrite or immediate move to many microservices is not required. Do not market or plan around a two-million-active-user capacity claim yet.

Voice/interpreter prototypes have been retired from the active workspace and download locations. They were not integrated into the main app/backend. Voice infrastructure is excluded from the recommended architecture.

## 1. What is actually running in this codebase

The primary backend uses Node.js 24, the built-in HTTP server and JavaScript modules. It accesses PostgreSQL with the pg driver; SQLite is a local-development fallback and production refuses to start without PostgreSQL. The mobile application is an Android Java shell containing a WebView and HTML/JavaScript screens. The audited main runtime is not a NestJS/Prisma/React Native application. Separate experiments in other folders were not treated as the production system.

The same HTTP service serves APIs, the public website, the admin console and static assets. Shipments are largely stored as JSON text in a shipments table. Vendor and rider accounts/sessions, notifications, routes, proofs, payments and earnings have their own tables. FCM push has durable database records and an in-process worker. A separate wallet/Redis/BullMQ implementation exists, but its mock-finance paths explicitly reject production activation; its existence does not establish that production has a general-purpose queue tier.

The Render Blueprint currently declares one free-plan web service and a free-plan PostgreSQL database, in Frankfurt. That is repository configuration, not proof of the live account's actual plans. Existing setup documentation incorrectly describes the Blueprint as selecting paid plans. The live host's CPU, memory, instance count, storage, IOPS, backup retention and quotas were not available.

Read-only requests to the live readiness/version endpoints could not be completed from this execution environment. This does not establish that the live service is down. The audited local commit could not be matched to a deployed commit.

## 2. Current onboarding and business capacity

Vendors: a dedicated account/session model exists. No fixed global account-count cap was found. Returning vendors currently fetch their entire shipment history in one response; more accounts and more history make workload and client storage grow.

Riders/drivers: a rider account model exists, with vehicle types and pickup/carrier/last-mile delivery legs. The default active-shipment matching limit is five per rider. This is an operational workload rule, not a limit of five riders or a backend capacity guarantee. Up to ten push installations per account are allowed by the push registration code.

Courier companies: carrier movement exists within the shipment workflow, but a dedicated organization/tenant model with company membership, fleet staff permissions, branch/hub ownership, organization billing and organization-scoped data was not found in the audited primary runtime. Regional-admin state scoping is not the same as courier-company tenancy. The platform should not promise large multi-company fleet onboarding without defining and testing that model.

Other users: public customer tracking links do not require a full account. They still generate API/database load. Operations/admin users have powerful views whose current implementation also becomes more expensive as data grows.

Capacity conclusion: none of these role models supplies a verified maximum safe number of simultaneously active people. Start with measured, controlled cohorts and expand only after latency, errors, queues, database work and recovery tests pass.

## 3. Highest-priority architectural findings

### A. Global write serialization prevents normal horizontal write scaling — critical

server/database.mjs:28 creates a six-connection read pool and a one-connection mutation pool per process. Lines 39–47 acquire the same PostgreSQL advisory lock for every ordinary POST/PUT/DELETE-style request and release it after the entire handler. server/server.mjs:119 wraps the general request handler this way. Dedicated newer finance HTTP paths have specific exceptions and must be evaluated separately.

An unrelated rider GPS upload, login-code request, dispatch-sync POST and shipment update can wait behind one another. Provider work is awaited inside several of those handlers. For example, email/SMS/payment calls have up to 20-second provider timeouts. Separate read connections help tracking reads, but they do not make ordinary mutations concurrent.

The lock is a correctness guard for the current read/modify/write JSON approach. Simply deleting it risks double acceptance, lost updates and broken money/custody behavior. Replace it through short, per-shipment or per-account transactions, row-level locks/version checks, atomic capacity reservations and durable event/outbox records. Move external side effects outside the critical transaction. Preserve idempotency and test competing requests before changing the guard.

### B. Matching and GPS updates scan the whole shipment collection — critical

server/market.mjs:27–28 loads all shipment JSON; matchingOffers at line 89 iterates the collection and may query route eligibility for each item. server/operations.mjs:689 scans every shipment inside a transaction for a single rider's GPS fix. That work grows with all historical shipments rather than that rider's active assignments.

Introduce indexed relational fields/tables for assignment, route, direction, status, account, timestamps and active delivery leg. Fetch only eligible active candidates and the authenticated rider's assigned live shipments. Keep shipment history append-only and retrieve it in pages. GPS should update the current rider/delivery location record rather than rewrite the full shipment/event payload.

### C. Matching loads encrypted identity documents unnecessarily — critical

server/market.mjs:70 selects every column of all submitted/approved rider profiles. That includes identity_cipher, not just matching fields. Every new-shipment fan-out can therefore fetch large encrypted identity images before filtering eligibility. Encryption protects the content but does not remove its memory, transfer or storage cost.

Select only the small matching columns and filter candidates in SQL by indexed service geography/route/direction/availability. Move encrypted ID images to private object storage, retaining protected metadata and object references in the database. Preserve encryption keys, authorization and audit access; do not make the documents public to reduce latency.

### D. Polling multiplies traffic; some polling is treated as a write — high

web/features.mjs polls inbox/dispatch approximately every ten seconds while visible. The dispatch-sync endpoint is POST and can recover notification records, so it participates in the shared write queue. web/app.js also synchronizes every ten seconds, and public tracking refreshes every five seconds. Android TrackingService requests GPS updates around ten seconds/ten metres; real uploads depend on location callbacks and network state.

Use an authenticated read-only incremental feed for ordinary reads, push/SSE/WebSocket events when practical, cursor/version changes, jitter and exponential backoff. Recovery/materialization should be queued independently rather than making every poll a serialized write. Keep a bounded polling fallback for weak networks.

### E. Admin pagination and live-map deltas still do full underlying work — high

server/admin.mjs:26–27 loads whole shipments and account sets; users/counts are built with repeated in-memory filters. Several pages filter and slice after loading everything. server/live-operations.mjs:189 reads the entire shipment collection before returning active map records/deltas. A small response does not imply a cheap database query.

Perform SQL filtering, aggregation and cursor pagination. Use a separate operational read model/materialized summaries for the map and dashboard. A user's regional/company scope must restrict the database query itself, rather than loading all data and filtering afterward.

### F. Notifications have durable state but a pilot-sized processing loop — high

server/push/delivery-push.mjs has retry states, leases, invalid-token disabling and a durable inbox/delivery table. These are useful foundations. Its in-process drain sends one job at a time, at most ten per drain; a timer wakes it every fifteen seconds and event kicks can start additional drains.

With only timer wakeups and instantaneous provider sends, ten per fifteen seconds is about 0.67 sends/second per process. This is a conditional backlog illustration, NOT a universal maximum: event kicks, provider delay and additional instances change the result. Backlogs, a web-process restart or provider throttling can still delay alerts significantly.

Run dedicated notification workers with atomic claims, bounded concurrency/batching, retry/backoff/jitter, dead-letter handling, provider quota controls and alerting on oldest-pending age. Keep durable database outbox events and user/session relevance checks. Do not equate provider acceptance with a phone displaying the alert.

### G. Infrastructure availability and failure isolation are not demonstrated — high

The Blueprint specifies a single web service and single database configuration, with no demonstrated multi-instance failover, database standby, recovery drill or autoscaling policy. Free-plan configuration is not a production-scale sizing plan. No live plan or provider quota was verified.

Use an always-on production tier, at least two independently replaceable API instances and load balancing when the application is concurrency-safe. Use managed database failover, tested point-in-time recovery, secure key backups and restore drills. Deploy workers separately. Protect identity encryption keys; losing them makes encrypted documents unreadable even if the database is restored.

Static routes currently acquire a database request connection before serving files and use synchronous file reads with no-store caching. Database or connection-pool trouble can therefore affect website/app assets too. Put public/versioned static assets behind object storage/CDN and reserve database connections for actual API work. Cache only appropriate public assets; do not cache private shipment or account responses publicly.

### H. Operational controls need to match a multi-instance system — high

Several request-rate maps are in process memory and use req.socket.remoteAddress. They do not share limits across instances; behind a proxy, that address may represent the proxy, and carrier NAT can also group legitimate users. The actual deployed proxy behavior must be checked. Do not blindly trust client-supplied forwarded headers.

Use shared per-account/device/IP controls with a known trusted-proxy configuration. Add redacted request IDs, structured logs, latency/error/throughput metrics, event-loop lag, CPU/memory, database wait/lock metrics, queue age and provider failures. The general HTTP error path returns generic errors without a complete observability pipeline. A health endpoint alone does not show customer-facing reliability.

The Node requestTimeout value limits receiving an HTTP request; it is not proof of a complete end-to-end application deadline. Define coherent execution/provider/queue budgets and backpressure explicitly.

## 4. Local verification results

A fresh, isolated PostgreSQL 18.6 instance was created solely for this audit. The local database adapter was exercised with synthetic work. No real accounts, customer records, production database or external providers were used. The experiment's schema was removed afterward. The test is reproducible with scripts/audit-capacity.mjs.

Twenty concurrent ordinary mutations, each holding the existing lock for an artificial 100 ms, completed at about 9.70 operations/second with one adapter instance and 9.69 with two. Maximum simultaneous mutation bodies remained one. At a 40 ms synthetic hold, the rates were 23.64 and 23.78 operations/second, again with one active mutation body. This confirms that adding adapter instances does not remove this lock. It is NOT an HTTP benchmark, a production throughput promise or a supported-user count.

With synthetic shipment JSON of approximately one kilobyte of description per record, reading/parsing all 5,000 records took a median 27 ms; 50,000 took 289 ms in this local experiment. Owner lookups used sequential scans: the 50,000-row case returned 50 records while filtering out 49,950. Dataset shape, hardware, cache and production data differ. Do not extrapolate these times directly to two million users.

The shipped schema lacks an owner index on shipments in the audited creation path. Composite notification/status/assignment access paths also need measured plans and appropriate indexes. Adding an owner index alone will not fix code that explicitly selects all shipment records.

Raw observations are in local-experiment.json. Existing source comments and concurrency documentation already identify the global lock as an intentional pilot limitation.

## 5. What “two million active users” could mean

These are planning scenarios, not measured capacity. Each scenario assumes only one ten-second poll per concurrently active user; the existing app may make additional requests.

Scenario A: 20,000 concurrent users generate 2,000 polling requests/second. If 5,000 riders also upload a GPS fix every ten seconds, add 500 GPS writes/second.

Scenario B: 100,000 concurrent users generate 10,000 polling requests/second. If 20,000 riders upload every ten seconds, add 2,000 GPS writes/second.

Scenario C: 400,000 concurrent users generate 40,000 polling requests/second. If 50,000 riders upload every ten seconds, add 5,000 GPS writes/second.

If the requirement is literally two million simultaneous users, the same single polling pattern alone is 200,000 requests/second before additional activity. Two million registered accounts, two million monthly users and two million daily users imply very different peaks. None should be treated as two million simultaneous connections automatically.

Other sizing inputs needed: daily shipments, peak shipment creation/acceptance rate, average events per shipment, notification recipients per event, live tracking viewers, identity-document sizes, retention policy, city/state distribution, provider quotas and growth rate. Image-heavy identity records can dominate database size long before account rows do.

## 6. Recommended target architecture

Clients (Android app, customer tracking and admin) reach CDN/WAF/load balancer, then horizontally scalable API instances. Public assets are served separately. Keep delivery, accounts, routes and finance as explicit modules initially, rather than multiplying services prematurely.

PostgreSQL remains the durable system of record: normalized shipments/assignments, append-only shipment events, money ledger where activated, idempotency records and an event outbox. Use short row-scoped transactions, indexes, controlled migrations and pooled connections sized across all replicas. Read replicas can serve suitable read workloads later, but custody, money and freshness-sensitive checks require deliberate consistency rules.

Separate worker processes consume dispatch, notification, email/SMS and payment/reconciliation jobs. A managed queue/Redis service can provide dispatch and presence/cache functions; durable business state and monetary truth remain in the database. Use private encrypted object storage for identity images and a controlled retention/deletion policy.

Tracking ingestion should authenticate the rider and assignment, validate location freshness, update bounded latest-location state and fan out authorized deltas. A cache/presence tier and short-lived tracking channels reduce database polling. Partition/archive historical location events only when retention and measurements justify it.

Admin reporting and live operations use bounded read models. Courier organization membership, branches and shipment ownership must be first-class authorization scope before multi-company expansion. Do not put every company in the same unrestricted fleet account.

Scale out or partition by measured city/region workloads only after the indexed, concurrent single-region architecture has been load-tested. Do not begin by sharding financial state without a clear transaction/reconciliation design.

## 7. Delivery roadmap and acceptance gates

Gate 1 — establish the production baseline. Inventory the actual hosting plans, database size/connections, slow queries, traffic, peak riders, backlog age, provider quotas and backups. Verify the deployed commit and readiness. Instrument before increasing onboarding. Fix misleading deployment documentation. Confirm a restore works and the identity key backup decrypts a controlled record.

Gate 2 — remove known growth hazards. Add reviewed indexes and server-side pagination; stop fetching ID ciphertext in matching; query only a rider's active assignments; bound history/sync payloads; move static assets off the database request path. Use expand/backfill/verify/cutover migrations and retain rollback paths.

Gate 3 — replace global write locking safely. Add normalized assignment/status/version fields and atomic per-shipment/account transactions. Create outbox events in the same transaction. Move provider calls to workers. Prove concurrent acceptance, GPS/handoff races, payment callback replay and delivery confirmation cannot lose state, double-assign work or duplicate monetary effects. Do not just remove the existing lock.

Gate 4 — resilience and increasing load. Run staged 10/100/1,000/10,000 concurrent-client tests as relevant to the measured baseline; then test the forecast peak and twice that peak on appropriately sized staging. These are test levels, not an automatic promise of supported users. Include realistic historical data and geographic skew, not only empty tables.

Gate 5 — two-million-active-user readiness. Agree daily/monthly activity and actual peak concurrency, validate matching/tracking/notification/provider loads together, complete multi-instance/database failover and recovery drills, and publish an observed capacity envelope with headroom, cost and a repeatable runbook. Open onboarding cohorts only while service objectives and operational staffing remain healthy.

Suggested initial service objectives, subject to product agreement: ordinary API p95 below 500 ms and p99 below 2 seconds at the agreed peak; less than 0.1% unexpected server errors; no lost acknowledged business state in retry/concurrency tests; notification enqueue p95 below 1 second and queue age within an agreed delivery target under controlled provider quotas. Measure provider acceptance and device arrival separately. Treat these as acceptance targets, not results achieved here.

## 8. Required production/staging test matrix

Create/accept/handoff/deliver: many users compete for the same parcel; only one authorized transition succeeds. Replayed requests return a stable result. No update is silently overwritten.

Tracking: moving riders, stale fixes, network loss/reconnect, reassignment and delivery completion. A former custodian loses access; coordinates do not leak to unrelated users.

Notifications: realistic fan-out, worker crash, expired device tokens, provider outage/throttling and accumulated backlog. Messages remain tied to the current account/device and are not multiplied by retries.

Finance: webhook replay and out-of-order callbacks, provider timeouts, ledger/settlement reconciliation and recovery. Keep the existing mock-production guardrails; this audit does not activate finance features.

Infrastructure: terminate an API instance, restart a worker, exhaust a connection pool in staging, fail over the database and restore a backup. Verify recovery time and acknowledged state. Test several-hour soak traffic, burst login/OTP load and regional hot spots. Never perform destructive/load tests against production without a separate controlled operational plan.

Client/storage: vendors with large histories, low-memory Android devices, full local storage, large identity uploads and interrupted login. Pagination, cache bounds, retry states and API limits must prevent blank screens and storage exhaustion.

## 9. Useful product work after the foundation

The first priority is reliability rather than adding AI, more animations or additional delivery modes. Most useful next capabilities are courier-company/team permissions and scoped fleet operations; a coherent support/exception workflow built on existing incident controls; and trustworthy settlement/reconciliation visibility before expanding money movement. Several related features already exist in pilot/prototype form, so strengthen and verify those rather than duplicating screens.

Operational capacity also matters: identity-review throughput, customer support, rider verification, fleet supervision, dispute resolution and provider account limits can constrain onboarding even when servers are healthy.

## 10. What remains unverified

Actual live Render resources/plan, deployed commit, metrics, uptime, real database size/schema/index drift, backup retention and restore performance, Redis/worker deployment, provider limits, real device push latency and production traffic were unavailable. No maximum user count, two-million-user test, production-cost quotation, live failover or zero-downtime guarantee is claimed.

The outcome is an evidence-backed architecture diagnosis and staged implementation plan. The production runtime was not rewritten or deployed during this audit. The standalone voice prototypes were retired; their archive is outside the active product repository.
