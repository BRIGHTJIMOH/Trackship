import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { adminFixture, vendorProfile, riderProfile } from "./admin-fixture.mjs";
import {
  operationsRecord,
  liveOperations,
} from "../server/live-operations.mjs";
import {
  carrierGroups,
  clusterGroups,
  gpsState,
  matchesOperations,
} from "../admin/live-map-model.mjs";
const at = Date.now(),
  session = "a".repeat(64),
  rider = "sample-rider";
function shipment(i = 1, extra = {}) {
  return {
    id: randomUUID(),
    code: "SR-SAMPLE-" + i,
    workflowVersion: 5,
    status: "In transit",
    custodian: "carrier",
    deliveryType: "interstate",
    origin: "Zaria",
    originState: "Kaduna",
    destination: "Ikeja",
    destinationState: "Lagos",
    routeId: "route-a",
    createdAt: new Date(at).toISOString(),
    actors: { carrier: { id: rider } },
    locationConsent: { actor: rider, leg: "carrier", sessionHash: session },
    location: {
      lat: 11.08,
      lng: 7.72,
      accuracy: 12,
      leg: "carrier",
      at: new Date(at - 1000).toISOString(),
      receivedAt: new Date(at - 500).toISOString(),
    },
    events: [
      {
        status: "In transit",
        leg: "carrier",
        at: new Date(at - 1000).toISOString(),
        actorName: "SECRET NAME",
        note: "PRIVATE NOTE",
      },
    ],
    phone: "PRIVATE PHONE",
    recipient: "PRIVATE NAME",
    address: "PRIVATE ADDRESS",
    publicToken: "PRIVATE TOKEN",
    deliveryCode: "PRIVATE CODE",
    ...extra,
  };
}
const context = {
  now: at,
  sessions: new Map([[session, { rider_id: rider, expires: at + 600000 }]]),
  suspended: new Set(),
};
test("live map: current-holder consent/session, genuine server timestamps and stale/future GPS are enforced", () => {
  const s = shipment(),
    record = operationsRecord(s, context);
  assert.equal(record.gps.state, "fresh");
  assert.equal(
    operationsRecord(
      { ...s, locationConsent: { ...s.locationConsent, actor: "wrong" } },
      context,
    ).gps.state,
    "unavailable",
  );
  assert.equal(
    operationsRecord({ ...s, custodian: "pickup" }, context).gps.state,
    "unavailable",
  );
  assert.equal(
    operationsRecord(
      { ...s, location: { ...s.location, receivedAt: undefined } },
      context,
    ).gps.state,
    "unavailable",
  );
  assert.equal(
    operationsRecord(
      {
        ...s,
        location: { ...s.location, receivedAt: new Date(at + 1).toISOString() },
      },
      context,
    ).gps.state,
    "unavailable",
  );
  assert.equal(
    operationsRecord(s, { ...context, now: at + 120001 }).gps.state,
    "stale",
  );
  assert.equal(
    operationsRecord(s, { ...context, sessions: new Map() }).gps.state,
    "unavailable",
  );
  assert.equal(
    operationsRecord(s, { ...context, suspended: new Set([rider]) }).gps.state,
    "unavailable",
  );
  assert.equal(operationsRecord({ ...s, status: "Delivered" }, context), null);
  assert.equal(operationsRecord({ ...s, status: "Cancelled" }, context), null);
  assert(!JSON.stringify(record).includes("PRIVATE"));
  assert(!JSON.stringify(record).includes("SECRET"));
  assert.notEqual(record.holderKey, rider);
});
test("live map: carrier groups retain per-parcel freshness; overlapping carriers cluster and custody filters work", () => {
  const a = operationsRecord(shipment(), context),
    b = operationsRecord(shipment(2), context),
    c = operationsRecord(
      shipment(3, {
        actors: { carrier: { id: "other" } },
        locationConsent: {
          actor: "other",
          leg: "carrier",
          sessionHash: "b".repeat(64),
        },
      }),
      {
        ...context,
        sessions: new Map([
          ["b".repeat(64), { rider_id: "other", expires: at + 600000 }],
        ]),
      },
    );
  let groups = carrierGroups([a, b, c], { now: at });
  assert.equal(groups.length, 2);
  assert.equal(groups[0].records.length, 2);
  const cells = clusterGroups(groups, (p) => ({
    x: p.lng * 10,
    y: p.lat * 10,
  }));
  assert.equal(cells.length, 1);
  assert.equal(cells[0].records.length, 3);
  assert.equal(carrierGroups([a, b], { now: at + 120001 }).length, 0);
  assert.equal(
    carrierGroups([a, b], { now: at + 120001, showStale: true })[0].freshness,
    "stale",
  );
  assert.equal(gpsState(a, at + 120001), "stale");
  assert(
    matchesOperations(a, {
      state: "Lagos",
      city: "Zaria",
      route: "route-a",
      status: "In transit",
      type: "interstate",
      search: "sample",
    }),
  );
  assert(!matchesOperations(a, { state: "Ogun" }));
});
test("live map HTTP: owner-only feed, minimal delta updates, handover/location expiry and terminal removal", async () => {
  const f = await adminFixture();
  try {
    assert.equal((await f.api("/api/admin/live-operations")).status, 401);
    assert.equal(
      (
        await f.api("/api/admin/live-operations", undefined, {
          token: f.env.TRACKSHIP_ADMIN_TOKEN,
        })
      ).status,
      401,
    );
    const vendor = await f.account("vendor", vendorProfile),
      riderAccount = await f.account("rider", riderProfile);
    for (const token of [vendor.token, riderAccount.token])
      assert.equal(
        (await f.api("/api/admin/live-operations", undefined, { token }))
          .status,
        401,
      );
    const owner = await f.login(),
      auth = { cookie: owner.cookie };
    const s = shipment();
    await f.server.database
      .prepare(
        "INSERT INTO rider_profiles(id,phone,identity_status,suspended) VALUES (?,?,'approved',0)",
      )
      .run(rider, "08022223333");
    await f.server.database
      .prepare("INSERT INTO rider_sessions VALUES (?,?,?)")
      .run(session, rider, Date.now() + 600000);
    await f.server.database
      .prepare(
        "INSERT INTO shipments(id,owner,public_hash,payload) VALUES (?,?,?,?)",
      )
      .run(s.id, "sample-owner", randomUUID(), JSON.stringify(s));
    let feed = await (
      await f.api("/api/admin/live-operations", undefined, auth)
    ).json();
    assert.equal(feed.reset, true);
    assert.equal(feed.upserts.length, 1);
    assert.equal(feed.upserts[0].gps.state, "fresh");
    assert(!JSON.stringify(feed).includes("PRIVATE"));
    let delta = await (
      await f.api(
        "/api/admin/live-operations?cursor=" + feed.cursor,
        undefined,
        auth,
      )
    ).json();
    assert.equal(delta.reset, false);
    assert.equal(delta.upserts.length, 0);
    s.custodian = "lastmile";
    s.status = "Last-mile rider received parcel";
    s.actors.lastmile = { id: "new-rider" };
    await f.server.database
      .prepare("UPDATE shipments SET payload=? WHERE id=?")
      .run(JSON.stringify(s), s.id);
    delta = await (
      await f.api(
        "/api/admin/live-operations?cursor=" + feed.cursor,
        undefined,
        auth,
      )
    ).json();
    assert.equal(delta.upserts[0].gps.state, "unavailable");
    assert.equal(delta.upserts[0].gps.position, null);
    feed = delta;
    s.status = "Delivered";
    await f.server.database
      .prepare("UPDATE shipments SET payload=? WHERE id=?")
      .run(JSON.stringify(s), s.id);
    delta = await (
      await f.api(
        "/api/admin/live-operations?cursor=" + feed.cursor,
        undefined,
        auth,
      )
    ).json();
    assert.deepEqual(delta.removed, [s.id]);
    assert.equal(delta.total, 0);
    assert.equal(
      (await f.api("/api/admin/live-operations", {}, auth)).status,
      405,
    );
  } finally {
    await f.close();
  }
});
test("live map: unsupported roles denied and restricted operations scopes never share deltas", async () => {
  const s = shipment();
  const db = {
    prepare(sql) {
      return {
        all: async () =>
          sql.includes("FROM shipments")
            ? [{ id: s.id, payload: JSON.stringify(s) }]
            : sql.includes("rider_sessions")
              ? [{ token_hash: session, rider_id: rider, expires: at + 600000 }]
              : [],
      };
    },
  };
  let identity = { role: "reviewer" },
    output;
  const route = liveOperations(db, {
    authorize: async () => identity,
    now: () => at,
  });
  const req = { method: "GET" },
    url = new URL("http://test/api/admin/live-operations");
  await route(req, url, (status, value) => (output = { status, value }));
  assert.equal(output.status, 403);
  identity = { role: "operations", shipmentIds: [s.id] };
  await route(req, url, (status, value) => (output = { status, value }));
  assert.equal(output.value.total, 1);
  const cursor = output.value.cursor;
  identity = { role: "operations", shipmentIds: [] };
  await route(
    req,
    new URL(url + "?cursor=" + cursor),
    (status, value) => (output = { status, value }),
  );
  assert.equal(output.value.reset, true);
  assert.equal(output.value.upserts.length, 0);
});
test("live map performance: 2,000 active parcels with shared carriers use bounded map marker groups", async (t) => {
  const start = performance.now(),
    rows = Array.from({ length: 2000 }, (_, i) =>
      operationsRecord(
        shipment(i, {
          location: {
            lat: 6.5 + (i % 60) * 0.02,
            lng: 3.3 + (i % 60) * 0.02,
            accuracy: 12,
            leg: "carrier",
            at: new Date(at - 1000).toISOString(),
            receivedAt: new Date(at - 500).toISOString(),
          },
          actors: { carrier: { id: "carrier-" + (i % 60) } },
          locationConsent: {
            actor: "carrier-" + (i % 60),
            leg: "carrier",
            sessionHash: session,
          },
        }),
        {
          ...context,
          sessions: new Map([
            [
              session,
              { rider_id: "carrier-" + (i % 60), expires: at + 600000 },
            ],
          ]),
        },
      ),
    );
  const groups = carrierGroups(rows, { now: at }),
    clusters = clusterGroups(groups, (p) => ({
      x: p.lng * 100,
      y: p.lat * 100,
    }));
  const duration = performance.now() - start;
  assert.equal(rows.length, 2000);
  assert(groups.length <= 60);
  assert(clusters.length <= 60);
  assert(duration < 2000);
  t.diagnostic(
    JSON.stringify({
      activeShipments: rows.length,
      carrierGroups: groups.length,
      mapClusters: clusters.length,
      projectionMs: Math.round(duration),
      jsonBytes: Buffer.byteLength(JSON.stringify(rows)),
    }),
  );
});

test('live map: older v3 clients without device observation time cannot appear live',()=>{const s=shipment(1,{workflowVersion:3});assert.equal(operationsRecord(s,context).gps.state,'stale');assert.equal(operationsRecord(s,context).gps.observedAt,null);s.location.observedAt=s.location.at;assert.equal(operationsRecord(s,context).gps.state,'fresh');s.location.observedAt=new Date(at-300000).toISOString();assert.equal(operationsRecord(s,context).gps.state,'stale');});
