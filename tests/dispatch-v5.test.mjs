import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { openDatabase } from "../server/database.mjs";
import { dispatchWorkflow } from "../server/dispatch-v5.mjs";
import { notificationOutbox } from "../server/outbox.mjs";
import { testDatabase } from "./database-fixture.mjs";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const request = () => randomUUID();
async function fixture(t, { interstate = false } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "sendrack-dispatch-")),
    database = await testDatabase(),
    db = await openDatabase({ env: database.env, dataDir: directory });
  t.after(async () => {
    await db.close();
    await database.cleanup();
    rmSync(directory, { recursive: true, force: true });
  });
  await db.exec(`CREATE TABLE shipments(id TEXT PRIMARY KEY,owner TEXT,public_hash TEXT,payload TEXT);
 CREATE TABLE rider_profiles(id TEXT PRIMARY KEY,identity_status TEXT,identity_format INTEGER,public_profile TEXT,suspended INTEGER);
 CREATE TABLE rider_sessions(token_hash TEXT PRIMARY KEY,rider_id TEXT,expires INTEGER);
 CREATE TABLE vendor_accounts(id TEXT PRIMARY KEY,owner_key TEXT,suspended INTEGER);
 CREATE TABLE vendor_sessions(token_hash TEXT PRIMARY KEY,vendor_id TEXT,expires INTEGER);
 CREATE TABLE test_earnings(shipment_id TEXT,leg TEXT,amount INTEGER,UNIQUE(shipment_id,leg));`);
  let clock = 1770000000000,
    failProvider = false,
    failCredits = false;
  const messages = [],
    actors = {};
  for (const id of ["vendor", "r1", "r2", "carrier", "lastmile", "stranger"]) {
    const kind = id === "vendor" ? "vendor" : "rider",
      sessionHash = hash(id);
    actors[id] = { id, kind, sessionHash };
    if (kind === "vendor") {
      await db
        .prepare("INSERT INTO vendor_accounts VALUES (?,?,0)")
        .run(id, "owner");
      await db
        .prepare("INSERT INTO vendor_sessions VALUES (?,?,?)")
        .run(sessionHash, id, clock + 30 * 86400000);
    } else {
      await db
        .prepare("INSERT INTO rider_profiles VALUES (?,'approved',4,?,0)")
        .run(
          id,
          JSON.stringify({
            state: "Kaduna",
            city: "Zaria",
            vehicle: "Bicycle",
          }),
        );
      await db
        .prepare("INSERT INTO rider_sessions VALUES (?,?,?)")
        .run(sessionHash, id, clock + 30 * 86400000);
    }
  }
  const id = randomUUID(),
    publicToken = randomBytes(32).toString("hex");
  const s = {
    id,
    publicToken,
    jobTokens: { pickup: randomBytes(32).toString("hex") },
    workflowVersion: 3,
    status: "Created",
    events: [],
    business: "Sample Vendor",
    description: "Small parcel",
    recipient: "Sample Customer",
    phone: "08012345678",
    address: "PRIVATE CUSTOMER ADDRESS",
    pickupAddress: "PRIVATE VENDOR ADDRESS",
    pickupCommunity: "GRA",
    origin: "Zaria",
    originState: "Kaduna",
    destination: interstate ? "Ikeja" : "Kaduna",
    destinationState: interstate ? "Lagos" : "Kaduna",
    deliveryType: interstate ? "interstate" : "intrastate",
    fees: interstate
      ? { pickup: 20000, carrier: 50000, lastmile: 30000 }
      : { pickup: 20000 },
    payment: { status: "unpaid", amount: interstate ? 110000 : 23000 },
    pricingBreakdown: { platformKobo: interstate ? 10000 : 3000 },
  };
  await db
    .prepare("INSERT INTO shipments VALUES (?,?,?,?)")
    .run(id, "owner", hash(publicToken), JSON.stringify(s));
  const get = async () =>
      JSON.parse(
        (await db.prepare("SELECT payload FROM shipments WHERE id=?").get(id))
          .payload,
      ),
    put = async (s) =>
      db
        .prepare("UPDATE shipments SET payload=? WHERE id=?")
        .run(JSON.stringify(s), s.id);
  const env = { NOTIFICATION_ENCRYPTION_KEY: randomBytes(32).toString("hex") };
  const engine = await dispatchWorkflow(db, {
    env,
    authorizeStaff: async (context, permission) => {
      if (context !== "test-staff")
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      return { id: "test-owner", mfa: true, permission };
    },
    getShipment: async (sid) => {
      const row = await db
        .prepare("SELECT payload FROM shipments WHERE id=?")
        .get(sid);
      return row ? JSON.parse(row.payload) : null;
    },
    putShipment: put,
    now: () => clock,
    sendNotification: async (row, payload) => {
      if (failProvider) throw new Error("Sensitive provider error");
      messages.push({ kind: row.kind, payload });
    },
    creditEarnings: async (s) => {
      if (failCredits) throw new Error("Simulated ledger write failure");
      for (const [leg] of Object.entries(s.actors))
        await db
          .prepare("INSERT OR IGNORE INTO test_earnings VALUES (?,?,?)")
          .run(s.id, leg, s.fees[leg]);
    },
  });
  const fix = () => ({
    lat: 11.085,
    lng: 7.72,
    accuracy: 10,
    observedAt: clock,
    consent: true,
  });
  await engine.initialize(s, {
    vendorId: "vendor",
    allowedVehicles: ["bicycle", "motorcycle"],
    pickupCoordinates: fix(),
  });
  const f = {
    db,
    engine,
    actors,
    id,
    publicToken,
    messages,
    get,
    fix,
    env,
    now: () => clock,
    advance: (n) => (clock += n),
    failProvider: (v) => (failProvider = v),
    failCredits: (v) => (failCredits = v),
    async fund() {
      const s = await get();
      s.payment.status = "paid";
      await put(s);
    },
    async assign() {
      await f.fund();
      await engine.position(actors.r1, fix());
      await engine.search(id);
      const [offer] = await engine.offers(actors.r1);
      await engine.accept(actors.r1, offer.offerId, request());
    },
    async collect() {
      await f.assign();
      await engine.progress(actors.r1, id, "travel", request());
      await engine.progress(actors.r1, id, "arrive", request());
      const h = await engine.initiateHandover(
        actors.vendor,
        id,
        "r1",
        request(),
      );
      await engine.acceptHandover(actors.r1, h.handoverId, request());
    },
    async verifyContact() {
      await engine.customer(publicToken, "request-contact-code");
      await engine.outbox.tick(50);
      const code = messages.findLast((m) => m.kind === "contact").payload.code;
      await engine.customer(publicToken, "verify-contact", { code });
    },
    async handover(from, to) {
      const h = await engine.initiateHandover(actors[from], id, to, request());
      return engine.acceptHandover(actors[to], h.handoverId, request());
    },
  };
  return f;
}

test("dispatch: paid offers require recent consented GPS, approved identity, area, vehicle and capacity", async (t) => {
  const f = await fixture(t),
    { engine: e, actors: a } = f;
  await e.position(a.r1, f.fix());
  assert.equal((await e.search(f.id)).reason, "not-dispatchable");
  await f.fund();
  await f.db
    .prepare(
      "UPDATE rider_profiles SET identity_status='submitted' WHERE id='r2'",
    )
    .run();
  await assert.rejects(() => e.position(a.r2, f.fix()), { status: 403 });
  await f.db
    .prepare("UPDATE rider_profiles SET public_profile=? WHERE id='stranger'")
    .run(JSON.stringify({ city: "Zaria", state: "Kaduna", vehicle: "Truck" }));
  await e.position(a.stranger, f.fix());
  assert.equal((await e.search(f.id)).offered, 1);
  const [offer] = await e.offers(a.r1);
  assert(offer);
  assert(!JSON.stringify(offer).includes("PRIVATE"));
  assert(!JSON.stringify(offer).includes("08012345678"));
  f.advance(120001);
  assert.equal((await e.offers(a.r1)).length, 0);
  await assert.rejects(() => e.accept(a.r1, offer.offerId, request()));
  await assert.rejects(
    () => e.position(a.r1, { ...f.fix(), observedAt: f.now() + 1 }),
    { status: 400 },
  );
  await assert.rejects(() => e.position(a.r1, { ...f.fix(), consent: false }), {
    status: 400,
  });
  await e.position(a.r1, f.fix());
  await e.search(f.id);
  await e.position(a.r1, { stop: true });
  assert.equal((await e.offers(a.r1)).length, 0);
});

test("dispatch: simultaneous acceptance has exactly one winner, preserves vendor custody and withdraws competitors", async (t) => {
  const f = await fixture(t),
    { engine: e, actors: a } = f;
  await f.fund();
  for (const id of ["r1", "r2"]) await e.position(a[id], f.fix());
  await e.search(f.id);
  const [o1] = await e.offers(a.r1),
    [o2] = await e.offers(a.r2);
  const attempts = await Promise.allSettled([
    e.accept(a.r1, o1.offerId, request()),
    e.accept(a.r2, o2.offerId, request()),
  ]);
  assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
  const s = await f.get();
  assert.equal(s.status, "Rider assigned");
  assert.equal(s.custodian, "vendor");
  assert.equal(
    (
      await f.db
        .prepare("SELECT * FROM dispatch_offers WHERE state='pending'")
        .all()
    ).length,
    0,
  );
  assert.equal((await e.inbox(a.r2)).length, 1);
  await assert.rejects(() => e.view(a.stranger, f.id), { status: 403 });
  await e.outbox.tick();
  assert.equal(
    f.messages.length,
    0,
    "delayed assigned-job pushes are discarded",
  );
});

test("dispatch: retries expand radius; decline and revoked sessions suppress offers", async (t) => {
  const f = await fixture(t),
    { engine: e, actors: a } = f;
  await f.fund();
  await e.position(a.r1, f.fix());
  const first = await e.search(f.id);
  assert.equal(first.radius, 3);
  const [o] = await e.offers(a.r1);
  await e.decline(a.r1, o.offerId, request());
  f.advance(120001);
  await e.position(a.r1, f.fix());
  const second = await e.search(f.id);
  assert.equal(second.radius, 6);
  assert.equal(second.offered, 0);
  await f.db
    .prepare("DELETE FROM rider_sessions WHERE token_hash=?")
    .run(a.r1.sessionHash);
  await assert.rejects(() => e.offers(a.r1), { status: 401 });
});

test("dispatch: vendor initiates collection, intended rider accepts, replay and skipped stages fail", async (t) => {
  const f = await fixture(t),
    { engine: e, actors: a } = f;
  await f.assign();
  await assert.rejects(() =>
    e.initiateHandover(a.vendor, f.id, "r1", request()),
  );
  await assert.rejects(() => e.progress(a.r1, f.id, "depart-final", request()));
  await e.progress(a.r1, f.id, "travel", request());
  await e.progress(a.r1, f.id, "arrive", request());
  const h = await e.initiateHandover(a.vendor, f.id, "r1", request());
  assert.equal((await f.get()).custodian, "vendor");
  await assert.rejects(() => e.acceptHandover(a.r2, h.handoverId, request()), {
    status: 403,
  });
  await e.acceptHandover(a.r1, h.handoverId, request());
  assert.equal((await f.get()).custodian, "pickup");
  await assert.rejects(() => e.acceptHandover(a.r1, h.handoverId, request()));
  const audit = await f.db
    .prepare("SELECT * FROM dispatch_events WHERE status='Parcel collected'")
    .get();
  assert.equal(audit.from_holder, "vendor");
  assert.equal(audit.to_holder, "pickup");
  assert.equal(audit.actor_id, "r1");
  assert(!JSON.stringify(await e.view(a.r1, f.id)).includes(f.publicToken));
});

test("dispatch: interstate chain checks carrier scope, clears old GPS and queues delivery code on lastmile physical receipt", async (t) => {
  const f = await fixture(t, { interstate: true }),
    { engine: e, actors: a } = f;
  await f.verifyContact();
  await f.collect();
  await e.shareJobLocation(a.r1, f.id, f.fix());
  assert((await f.get()).location);
  await assert.rejects(
    () => e.initiateHandover(a.r1, f.id, "carrier", request()),
    { status: 403 },
  );
  await f.db
    .prepare("INSERT INTO dispatch_permissions VALUES (?,?,?,?)")
    .run("carrier", "carrier", "test-admin", f.now());
  await f.handover("r1", "carrier");
  assert.equal((await f.get()).location, null);
  await assert.rejects(() => e.shareJobLocation(a.r1, f.id, f.fix()), {
    status: 403,
  });
  await assert.rejects(() =>
    e.initiateHandover(a.carrier, f.id, "lastmile", request()),
  );
  await e.progress(a.carrier, f.id, "depart-carrier", request());
  await e.progress(a.carrier, f.id, "arrive-carrier", request());
  f.failProvider(true);
  await f.handover("carrier", "lastmile");
  assert.equal((await f.get()).custodian, "lastmile");
  assert.equal((await f.get()).deliveryCodeStatus, "queued");
  await e.outbox.tick();
  assert.equal((await f.get()).deliveryCodeStatus, "queued");
  const failed = await f.db
    .prepare("SELECT * FROM notification_outbox WHERE kind='delivery'")
    .get();
  assert.equal(failed.attempts, 1);
  assert(!failed.payload_cipher.includes("08012345678"));
  assert(!failed.last_error.includes("Sensitive"));
  f.failProvider(false);
  f.advance(30001);
  await e.outbox.tick();
  assert.equal((await f.get()).deliveryCodeStatus, "sent");
  await e.progress(a.lastmile, f.id, "depart-final", request());
  const secret = f.messages.findLast((m) => m.kind === "delivery").payload.code;
  await assert.rejects(() => e.complete(a.carrier, f.id, secret, request()));
  await e.complete(a.lastmile, f.id, secret, request());
  assert.equal(
    (await f.db.prepare("SELECT * FROM test_earnings").all()).length,
    3,
  );
  const credits = await f.db
    .prepare("SELECT SUM(amount) AS total FROM test_earnings")
    .get();
  assert.equal(credits.total, 100000);
  assert.equal((await f.get()).payment.amount, 110000);
});

test("dispatch: intrastate OTP requires verified customer, final departure and single atomic completion", async (t) => {
  const f = await fixture(t),
    { engine: e, actors: a } = f;
  await f.collect();
  assert.equal(f.messages.filter((m) => m.kind === "delivery").length, 0);
  await e.progress(a.r1, f.id, "depart-final", request());
  assert.equal(
    (await f.get()).deliveryCodeStatus,
    "awaiting-customer-verification",
  );
  await f.verifyContact();
  await e.outbox.tick();
  const secret = f.messages.findLast((m) => m.kind === "delivery").payload.code;
  const publicData = e.publicView(await f.get(), f.now());
  assert(!JSON.stringify(publicData).includes(secret));
  assert(!JSON.stringify(publicData).includes("08012345678"));
  const key = request();
  const result = await e.complete(a.r1, f.id, secret, key);
  assert.deepEqual(await e.complete(a.r1, f.id, secret, key), result);
  await assert.rejects(() => e.complete(a.r1, f.id, secret, request()));
  assert.equal(
    (await f.db.prepare("SELECT * FROM test_earnings").all()).length,
    1,
  );
  assert.equal((await f.get()).custodian, "customer");
  assert.equal((await f.get()).location, null);
  f.advance(86400001);
  assert.equal(e.publicView(await f.get(), f.now()), null);
});

test("dispatch: wrong/locked, expired and replaced codes fail; durable attempts survive errors", async (t) => {
  const f = await fixture(t),
    { engine: e, actors: a } = f;
  await f.verifyContact();
  await f.collect();
  await e.progress(a.r1, f.id, "depart-final", request());
  await e.outbox.tick();
  const old = f.messages.findLast((m) => m.kind === "delivery").payload.code;
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      () => e.complete(a.r1, f.id, "not-the-code", request()),
      { status: 401 },
    );
  assert.equal(
    (
      await f.db
        .prepare("SELECT attempts FROM dispatch_codes WHERE kind='delivery'")
        .get()
    ).attempts,
    5,
  );
  await assert.rejects(() => e.complete(a.r1, f.id, old, request()), {
    status: 401,
  });
  f.advance(60001);
  await e.renewCode(a.r1, f.id, request());
  await assert.rejects(() => e.renewCode(a.r1, f.id, request()), {
    status: 429,
  });
  await assert.rejects(() => e.complete(a.r1, f.id, old, request()), {
    status: 401,
  });
  await e.outbox.tick();
  const next = f.messages.findLast((m) => m.kind === "delivery").payload.code;
  f.advance(24 * 3600000 + 1);
  await assert.rejects(() => e.complete(a.r1, f.id, next, request()), {
    status: 401,
  });
  assert.equal((await f.get()).status, "Out for delivery");
});

test("dispatch: disputes freeze custody, invalidate codes and remove location without inventing cancellation", async (t) => {
  const f = await fixture(t),
    { engine: e, actors: a } = f;
  await f.verifyContact();
  await f.collect();
  await e.progress(a.r1, f.id, "depart-final", request());
  await e.shareJobLocation(a.r1, f.id, f.fix());
  await e.incident(a.vendor, f.id, "damage", request());
  const s = await f.get();
  assert.equal(s.custodian, "pickup");
  assert.equal(s.incidentOpen, true);
  assert.equal(s.location, null);
  assert.equal(s.deliveryCodeStatus, "invalidated");
  await assert.rejects(() => e.renewCode(a.r1, f.id, request()));
  await e.outbox.tick();
  assert.equal(f.messages.filter((m) => m.kind === "delivery").length, 0);
});

test("dispatch: customer proof cannot use shipment ID; GPS is never future/stale and consent withdrawal clears sharing", async (t) => {
  const f = await fixture(t),
    { engine: e, actors: a } = f;
  await assert.rejects(() => e.customer(f.id, "request-contact-code"), {
    status: 404,
  });
  await f.collect();
  await e.shareJobLocation(a.r1, f.id, f.fix());
  assert(e.publicView(await f.get(), f.now()).location);
  assert.equal(e.publicView(await f.get(), f.now() - 1).location, null);
  f.advance(120001);
  assert.equal(e.publicView(await f.get(), f.now()).location, null);
  await e.position(a.r1, { stop: true });
  assert.equal((await f.get()).locationConsent, null);
});

test("outbox: deduplication, encryption, crash lease recovery and independent concurrent workers", async (t) => {
  const f = await fixture(t);
  let delivered = 0;
  const opts = {
    key: f.env.NOTIFICATION_ENCRYPTION_KEY,
    now: f.now,
    deliver: async () => {
      delivered++;
    },
  };
  const q = await notificationOutbox(f.db, opts),
    q2 = await notificationOutbox(f.db, opts);
  const job = {
    dedupe: "same-event",
    kind: "test",
    payload: { code: "SECRET-CODE" },
  };
  await f.db.withRequest("POST", async () => {
    await q.enqueue(job);
    await q.enqueue(job);
  });
  assert.equal(
    (await f.db.prepare("SELECT * FROM notification_outbox").all()).length,
    1,
  );
  const row = await f.db.prepare("SELECT * FROM notification_outbox").get();
  assert(!row.payload_cipher.includes("SECRET-CODE"));
  await Promise.all([q.tick(), q2.tick()]);
  assert.equal(delivered, 1);
  await q.enqueue({ ...job, dedupe: "crashed-event" });
  await f.db
    .prepare(
      "UPDATE notification_outbox SET state='processing',lease_until=? WHERE dedupe='crashed-event'",
    )
    .run(f.now() - 1);
  await q.tick();
  assert.equal(delivered, 2);
  assert.equal(
    (
      await f.db
        .prepare(
          "SELECT payload_cipher FROM notification_outbox WHERE dedupe='crashed-event'",
        )
        .get()
    ).payload_cipher,
    "",
  );
});

test("dispatch: staff authorization, cancellation and recipient changes invalidate authority without moving custody", async (t) => {
  const f = await fixture(t),
    { engine: e } = f;
  await assert.rejects(() => e.operations("forged"), { status: 403 });
  await assert.rejects(() => e.operate("forged", f.id, "cancel"), {
    status: 403,
  });
  await f.verifyContact();
  await e.operate("test-staff", f.id, "change-recipient", {
    phone: "08022223333",
  });
  assert.equal((await f.get()).recipientVerifiedAt, null);
  await e.operate("test-staff", f.id, "cancel");
  assert.equal((await f.get()).status, "Cancelled");
  assert.equal((await f.get()).custodian, "vendor");
  assert.equal(e.publicView(await f.get(), f.now()), null);
  assert((await e.operations("test-staff")).jobs.length);
});

test("dispatch: replacement requires staff approval and physical holder-to-recipient handover; previous code is invalid", async (t) => {
  const f = await fixture(t),
    { engine: e, actors: a } = f;
  await f.verifyContact();
  await f.collect();
  await e.progress(a.r1, f.id, "depart-final", request());
  await e.outbox.tick();
  const old = f.messages.findLast((m) => m.kind === "delivery").payload.code;
  await assert.rejects(() => e.initiateHandover(a.r1, f.id, "r2", request()));
  await assert.rejects(() => e.operate("test-staff", f.id, "cancel"));
  await e.shareJobLocation(a.r1, f.id, f.fix());
  await e.operate("test-staff", f.id, "approve-final-replacement", {
    riderId: "r2",
  });
  assert.equal((await f.get()).actors.pickup.id, "r1");
  await assert.rejects(() => e.complete(a.r1, f.id, old, request()), {
    status: 401,
  });
  await f.handover("r1", "r2");
  assert.equal((await f.get()).actors.pickup.id, "r2");
  assert.equal((await f.get()).location, null);
  assert.equal((await f.get()).custodian, "pickup");
  await assert.rejects(() => e.view(a.r1, f.id), { status: 403 });
  f.advance(60001);
  await e.progress(a.r2, f.id, "depart-final", request());
  await e.outbox.tick();
  const current = f.messages.findLast((m) => m.kind === "delivery").payload
    .code;
  await assert.rejects(() => e.complete(a.r2, f.id, old, request()), {
    status: 401,
  });
  await e.complete(a.r2, f.id, current, request());
});

test("dispatch: capacity and service-area mismatches suppress otherwise fresh positions", async (t) => {
  const f = await fixture(t),
    { engine: e, actors: a } = f;
  await f.fund();
  await e.position(a.r1, f.fix());
  await e.position(a.r2, f.fix());
  await f.db
    .prepare("UPDATE rider_profiles SET public_profile=? WHERE id='r2'")
    .run(JSON.stringify({ city: "Ikeja", state: "Lagos", vehicle: "Bicycle" }));
  for (let i = 0; i < 3; i++) {
    const id = randomUUID();
    await f.db.prepare("INSERT INTO shipments VALUES (?,?,?,?)").run(
      id,
      "owner",
      hash(id),
      JSON.stringify({
        id,
        status: "Out for delivery",
        actors: { pickup: { id: "r1" } },
      }),
    );
  }
  assert.equal((await e.search(f.id)).offered, 0);
});

test("dispatch: rejected/expired transfers do not move custody; carrier revocation is enforced on acceptance", async (t) => {
  const f = await fixture(t, { interstate: true }),
    { engine: e, actors: a } = f;
  await f.assign();
  await e.progress(a.r1, f.id, "travel", request());
  await e.progress(a.r1, f.id, "arrive", request());
  let h = await e.initiateHandover(a.vendor, f.id, "r1", request());
  await e.rejectHandover(a.r1, h.handoverId, request());
  await assert.rejects(() => e.acceptHandover(a.r1, h.handoverId, request()));
  assert.equal((await f.get()).custodian, "vendor");
  h = await e.initiateHandover(a.vendor, f.id, "r1", request());
  f.advance(900001);
  await assert.rejects(() => e.acceptHandover(a.r1, h.handoverId, request()));
  h = await e.initiateHandover(a.vendor, f.id, "r1", request());
  await e.acceptHandover(a.r1, h.handoverId, request());
  await e.operate("test-staff", f.id, "grant-carrier", { riderId: "carrier" });
  h = await e.initiateHandover(a.r1, f.id, "carrier", request());
  await f.db
    .prepare("DELETE FROM dispatch_permissions WHERE rider_id='carrier'")
    .run();
  await assert.rejects(
    () => e.acceptHandover(a.carrier, h.handoverId, request()),
    { status: 403 },
  );
  assert.equal((await f.get()).custodian, "pickup");
});

test("dispatch: ledger failure rolls back delivery/code consumption; concurrent completion credits once", async (t) => {
  const f = await fixture(t),
    { engine: e, actors: a } = f;
  await f.verifyContact();
  await f.collect();
  await e.progress(a.r1, f.id, "depart-final", request());
  await e.outbox.tick();
  const secret = f.messages.findLast((m) => m.kind === "delivery").payload.code;
  f.failCredits(true);
  await assert.rejects(() => e.complete(a.r1, f.id, secret, request()));
  assert.equal((await f.get()).status, "Out for delivery");
  assert.equal(
    (
      await f.db
        .prepare("SELECT used FROM dispatch_codes WHERE kind='delivery'")
        .get()
    ).used,
    0,
  );
  f.failCredits(false);
  const completions = await Promise.allSettled([
    e.complete(a.r1, f.id, secret, request()),
    e.complete(a.r1, f.id, secret, request()),
  ]);
  assert.equal(completions.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await f.db.prepare("SELECT * FROM test_earnings").all()).length,
    1,
  );
});

test("outbox: late worker completion cannot overwrite a recovered lease", async (t) => {
  const f = await fixture(t);
  let started,
    release,
    accepted = 0;
  const began = new Promise((r) => (started = r)),
    blocked = new Promise((r) => (release = r));
  const options = {
    key: f.env.NOTIFICATION_ENCRYPTION_KEY,
    now: f.now,
    accepted: async () => {
      accepted++;
    },
  };
  const first = await notificationOutbox(f.db, {
      ...options,
      deliver: async () => {
        started();
        await blocked;
      },
    }),
    second = await notificationOutbox(f.db, {
      ...options,
      deliver: async () => {},
    });
  await first.enqueue({
    dedupe: "slow-provider",
    kind: "test",
    payload: { message: "test" },
  });
  const pending = first.tick(1);
  await began;
  f.advance(60001);
  await second.tick(1);
  release();
  await pending;
  assert.equal(accepted, 1);
  const row = await f.db
    .prepare("SELECT * FROM notification_outbox WHERE dedupe='slow-provider'")
    .get();
  assert.equal(row.state, "sent");
  assert.equal(row.attempts, 2);
  assert.equal(row.payload_cipher, "");
});
