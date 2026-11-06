// Versioned domain service. The HTTP adapter is restricted to explicitly enabled nonproduction previews.
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { notificationOutbox } from "./outbox.mjs";
import { distanceKm, dispatchPublic } from "../web/dispatch-flow.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const normalized = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const problem = (message, status = 409) =>
  Object.assign(new Error(message), { status });
const fail = (message, status) => {
  throw problem(message, status);
};
const equal = (a, b) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const active = (s) => !["Delivered", "Cancelled"].includes(s.status);
const finalLeg = (s) =>
  s.deliveryType === "interstate" ? "lastmile" : "pickup";
const holder = (s) =>
  s.custodian === "vendor" ? s.vendorId : s.actors?.[s.custodian]?.id;
const terminalCode = new Set(["Delivered", "Cancelled"]);
const vehicles = ["bicycle", "motorcycle", "car", "van", "truck"];
const fixedInt = (env, name, fallback, min, max) => {
  const n = Number(env[name] ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`Invalid ${name}.`);
  return n;
};
export async function dispatchWorkflow(
  db,
  {
    env = {},
    sendNotification,
    getShipment,
    putShipment,
    creditEarnings,
    authorizeStaff = async () => {
      throw problem("Staff integration is not configured.", 503);
    },
    now = Date.now,
  } = {},
) {
  if (
    ![getShipment, putShipment, creditEarnings].every(
      (fn) => typeof fn === "function",
    )
  )
    throw new Error(
      "Shipment persistence and atomic earnings callbacks are required.",
    );
  const config = {
    gpsAge: 120000,
    gpsAccuracy: fixedInt(
      env,
      "DISPATCH_GPS_MAX_ACCURACY_METRES",
      200,
      10,
      1000,
    ),
    offerTtl: fixedInt(env, "DISPATCH_OFFER_SECONDS", 120, 30, 600) * 1000,
    maxRounds: fixedInt(env, "DISPATCH_MAX_ROUNDS", 5, 1, 20),
    radius: fixedInt(env, "DISPATCH_INITIAL_RADIUS_KM", 3, 1, 100),
    capacity: fixedInt(env, "DISPATCH_RIDER_CAPACITY", 3, 1, 20),
    codeTtl: fixedInt(env, "DELIVERY_CODE_TTL_HOURS", 24, 1, 168) * 3600000,
  };
  await db.exec(`CREATE TABLE IF NOT EXISTS dispatch_replacements(shipment_id TEXT PRIMARY KEY,rider_id TEXT,expected_version INTEGER,approved_by TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS dispatch_positions(rider_id TEXT PRIMARY KEY,session_hash TEXT,lat REAL,lng REAL,accuracy REAL,observed INTEGER,expires INTEGER);
 CREATE TABLE IF NOT EXISTS dispatch_jobs(shipment_id TEXT PRIMARY KEY,round INTEGER DEFAULT 0,next_at INTEGER,state TEXT);
 CREATE TABLE IF NOT EXISTS dispatch_offers(id TEXT PRIMARY KEY,shipment_id TEXT,rider_id TEXT,round INTEGER,state TEXT,expires INTEGER,created INTEGER,UNIQUE(shipment_id,rider_id,round));
 CREATE INDEX IF NOT EXISTS dispatch_offer_rider ON dispatch_offers(rider_id,state,expires);
 CREATE TABLE IF NOT EXISTS dispatch_events(id TEXT PRIMARY KEY,shipment_id TEXT,version INTEGER,status TEXT,actor_kind TEXT,actor_id TEXT,from_holder TEXT,to_holder TEXT,created INTEGER,UNIQUE(shipment_id,version));
 CREATE TABLE IF NOT EXISTS dispatch_handovers(id TEXT PRIMARY KEY,shipment_id TEXT,from_id TEXT,to_id TEXT,from_leg TEXT,to_leg TEXT,expected_version INTEGER,state TEXT,expires INTEGER,created INTEGER,accepted INTEGER);
 CREATE TABLE IF NOT EXISTS dispatch_permissions(rider_id TEXT,role TEXT,granted_by TEXT,created INTEGER,PRIMARY KEY(rider_id,role));
 CREATE TABLE IF NOT EXISTS dispatch_codes(shipment_id TEXT,kind TEXT,version TEXT,salt TEXT,hash TEXT,assignment INTEGER,recipient_hash TEXT,expires INTEGER,attempts INTEGER,used INTEGER,issued INTEGER,PRIMARY KEY(shipment_id,kind));
 CREATE TABLE IF NOT EXISTS dispatch_code_sends(shipment_id TEXT,kind TEXT,created INTEGER);
 CREATE TABLE IF NOT EXISTS dispatch_requests(actor_id TEXT,request_id TEXT,operation TEXT,response TEXT,PRIMARY KEY(actor_id,request_id));
 CREATE TABLE IF NOT EXISTS dispatch_incidents(id TEXT PRIMARY KEY,shipment_id TEXT,actor_id TEXT,kind TEXT,state TEXT,created INTEGER,resolved INTEGER);
 CREATE TABLE IF NOT EXISTS dispatch_inbox(id TEXT PRIMARY KEY,rider_id TEXT,shipment_id TEXT,title TEXT,created INTEGER,UNIQUE(rider_id,shipment_id,title));`);
  const tx = (fn) =>
    db.withRequest("POST", async () => {
      await db.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn();
        await db.exec("COMMIT");
        return result;
      } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
      }
    });
  const load = async (id) => {
    const s = await getShipment(id);
    if (!s || s.workflowVersion !== 5) fail("Shipment not found.", 404);
    return s;
  };
  async function authenticated(actor) {
    if (
      !actor ||
      !["vendor", "rider"].includes(actor.kind) ||
      typeof actor.id !== "string" ||
      !actor.sessionHash
    )
      fail("Authenticated participant required.", 401);
    const table =
        actor.kind === "vendor" ? "vendor_sessions" : "rider_sessions",
      column = actor.kind === "vendor" ? "vendor_id" : "rider_id";
    const session = await db
      .prepare(
        `SELECT ${column} AS id,expires FROM ${table} WHERE token_hash=?`,
      )
      .get(actor.sessionHash);
    if (!session || session.id !== actor.id || session.expires <= now())
      fail("Session expired or revoked.", 401);
    const profile = await db
      .prepare(
        `SELECT * FROM ${actor.kind === "vendor" ? "vendor_accounts" : "rider_profiles"} WHERE id=?`,
      )
      .get(actor.id);
    if (!profile || profile.suspended) fail("Account unavailable.", 403);
    if (
      actor.kind === "rider" &&
      (profile.identity_status !== "approved" || profile.identity_format < 4)
    )
      fail("An approved rider identity submission is required.", 403);
    return profile;
  }
  function participant(s, actor) {
    if (actor.kind === "vendor" && actor.id === s.vendorId) return "vendor";
    if (actor.kind === "rider") {
      for (const [leg, r] of Object.entries(s.actors || {}))
        if (r.id === actor.id) return leg;
    }
    fail("Shipment access denied.", 403);
  }
  function expect(s, status, leg, actor) {
    if (s.incidentOpen) fail("Resolve the open incident before continuing.");
    if (s.status !== status || participant(s, actor) !== leg)
      fail("This action does not match the current assignment and checkpoint.");
  }
  async function event(
    s,
    status,
    actor,
    { to = s.custodian, from = s.custodian } = {},
  ) {
    s.version = (s.version || 0) + 1;
    s.status = status;
    if (to !== from || terminalCode.has(status)) {
      s.location = null;
      s.locationConsent = null;
    }
    s.custodian = to;
    const e = {
      id: randomUUID(),
      status,
      leg:
        actor.kind === "vendor"
          ? "vendor"
          : Object.keys(s.actors || {}).find(
              (k) => s.actors[k].id === actor.id,
            ) || actor.kind,
      actorId: actor.id,
      fromHolder: from,
      toHolder: to,
      at: new Date(now()).toISOString(),
    };
    s.events.push(e);
    await db
      .prepare("INSERT INTO dispatch_events VALUES (?,?,?,?,?,?,?,?,?)")
      .run(
        e.id,
        s.id,
        s.version,
        status,
        actor.kind,
        actor.id,
        from,
        to,
        now(),
      );
    await putShipment(s);
    return s;
  }
  async function invalidate(s) {
    await db
      .prepare(
        "UPDATE dispatch_codes SET used=1 WHERE shipment_id=? AND kind='delivery'",
      )
      .run(s.id);
    s.deliveryCodeStatus = "invalidated";
  }
  const outbox = await notificationOutbox(db, {
    key: env.NOTIFICATION_ENCRYPTION_KEY,
    now,
    deliver: async (row, payload) => {
      if (!sendNotification)
        fail("Notification provider is not configured.", 503);
      await sendNotification(row, payload);
    },
    validate: async (row, payload) => {
      const s = await getShipment(row.shipment_id);
      if (!s || !active(s) || s.tracking?.revoked) return false;
      if (row.kind === "offer") {
        const offer = await db
          .prepare("SELECT * FROM dispatch_offers WHERE id=?")
          .get(payload.offerId);
        return !!(
          offer?.state === "pending" &&
          offer.expires > now() &&
          s.status === "Shipment created" &&
          s.payment?.status === "paid" &&
          (await eligible(row.recipient_id, s, payload.radius))
        );
      }
      const proof = await db
        .prepare("SELECT * FROM dispatch_codes WHERE shipment_id=? AND kind=?")
        .get(s.id, row.kind);
      return !!(
        proof &&
        !proof.used &&
        proof.version === payload.version &&
        proof.expires > now() &&
        proof.recipient_hash === hash(s.phone) &&
        (!["delivery"].includes(row.kind) ||
          proof.assignment === s.assignmentVersion)
      );
    },
    accepted: async (row, payload) => {
      if (row.kind !== "delivery") return;
      const proof = await db
        .prepare("SELECT * FROM dispatch_codes WHERE shipment_id=? AND kind=?")
        .get(row.shipment_id, "delivery");
      const s = await getShipment(row.shipment_id);
      if (s && active(s) && proof?.version === payload.version && !proof.used) {
        s.deliveryCodeStatus = "sent";
        await putShipment(s);
      }
    },
  });
  async function idempotent(actor, key, operation, fn) {
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key || ""))
      fail("A unique request ID is required.", 400);
    const result = await tx(async () => {
      await authenticated(actor);
      const previous = await db
        .prepare(
          "SELECT * FROM dispatch_requests WHERE actor_id=? AND request_id=?",
        )
        .get(actor.id, key);
      if (previous) {
        if (previous.operation !== operation)
          fail("Request ID belongs to another operation.");
        return JSON.parse(previous.response);
      }
      const response = await fn();
      if (!response?._error)
        await db
          .prepare("INSERT INTO dispatch_requests VALUES (?,?,?,?)")
          .run(actor.id, key, operation, JSON.stringify(response));
      return response;
    });
    if (result?._error) throw problem(result._error, result.status);
    return result;
  }
  async function freshPosition(riderId) {
    const p = await db
      .prepare("SELECT * FROM dispatch_positions WHERE rider_id=?")
      .get(riderId);
    if (
      !p ||
      p.observed > now() ||
      p.expires <= now() ||
      now() - p.observed >= config.gpsAge ||
      p.accuracy > config.gpsAccuracy
    )
      return null;
    const sess = await db
      .prepare("SELECT * FROM rider_sessions WHERE token_hash=?")
      .get(p.session_hash);
    return sess?.rider_id === riderId && sess.expires > now() ? p : null;
  }
  async function eligible(riderId, s, radius) {
    const r = await db
      .prepare("SELECT * FROM rider_profiles WHERE id=?")
      .get(riderId);
    if (
      !r ||
      r.suspended ||
      r.identity_status !== "approved" ||
      r.identity_format < 4
    )
      return false;
    const p = await freshPosition(riderId);
    if (!p || distanceKm(p, s.pickupCoordinates) > radius) return false;
    let profile;
    try {
      profile = JSON.parse(r.public_profile || "{}");
    } catch {
      return false;
    }
    if (
      normalized(profile.state) !== normalized(s.originState) ||
      normalized(profile.city) !== normalized(s.origin) ||
      !s.allowedVehicles.includes(normalized(profile.vehicle))
    )
      return false;
    const all = await db.prepare("SELECT payload FROM shipments").all();
    const count = all
      .map((r) => JSON.parse(r.payload))
      .filter(
        (j) =>
          active(j) &&
          Object.values(j.actors || {}).some((a) => a.id === riderId),
      ).length;
    return count < config.capacity;
  }
  function validFix(p, maxAge = 30000) {
    return (
      p &&
      Number.isFinite(p.lat) &&
      Math.abs(p.lat) <= 90 &&
      Number.isFinite(p.lng) &&
      Math.abs(p.lng) <= 180 &&
      Number.isFinite(p.accuracy) &&
      p.accuracy >= 0 &&
      p.accuracy <= config.gpsAccuracy &&
      Number.isSafeInteger(p.observedAt) &&
      p.observedAt <= now() &&
      now() - p.observedAt <= maxAge
    );
  }
  async function code(s, kind) {
    if (
      kind === "delivery" &&
      (!s.recipientVerifiedAt || s.verifiedRecipientHash !== hash(s.phone))
    ) {
      s.deliveryCodeStatus = "awaiting-customer-verification";
      await putShipment(s);
      return {
        queued: false,
        reason: "Customer contact verification required",
      };
    }
    const last = await db
      .prepare(
        "SELECT created FROM dispatch_code_sends WHERE shipment_id=? AND kind=? ORDER BY created DESC LIMIT 1",
      )
      .get(s.id, kind);
    const sends = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM dispatch_code_sends WHERE shipment_id=? AND kind=? AND created>?",
      )
      .get(s.id, kind, now() - 86400000);
    if ((last && now() - last.created < 60000) || sends.count >= 5)
      fail("Code resend limit reached. Try later.", 429);
    const previous = await db
      .prepare(
        "SELECT salt,hash FROM dispatch_codes WHERE shipment_id=? AND kind=?",
      )
      .get(s.id, kind);
    let secret;
    do {
      secret = String(randomInt(100000, 1000000));
    } while (previous && equal(previous.hash, hash(previous.salt + secret)));
    const salt = randomBytes(32).toString("hex"),
      version = randomUUID(),
      expires = now() + (kind === "delivery" ? config.codeTtl : 600000);
    await db
      .prepare(
        "INSERT INTO dispatch_codes VALUES (?,?,?,?,?,?,?,?,0,0,?) ON CONFLICT(shipment_id,kind) DO UPDATE SET version=excluded.version,salt=excluded.salt,hash=excluded.hash,assignment=excluded.assignment,recipient_hash=excluded.recipient_hash,expires=excluded.expires,attempts=0,used=0,issued=excluded.issued",
      )
      .run(
        s.id,
        kind,
        version,
        salt,
        hash(salt + secret),
        s.assignmentVersion,
        hash(s.phone),
        expires,
        now(),
      );
    await db
      .prepare("INSERT INTO dispatch_code_sends VALUES (?,?,?)")
      .run(s.id, kind, now());
    await outbox.enqueue({
      dedupe: `${kind}:${s.id}:${version}`,
      kind,
      shipmentId: s.id,
      recipientId: "customer",
      payload: {
        phone: s.phone,
        version,
        code: secret,
        expires,
        message:
          kind === "delivery"
            ? `SendRack delivery code ${secret}. Keep it private until you receive parcel ${s.code}. It expires ${new Date(expires).toISOString()}.`
            : `Verify the contact for SendRack parcel ${s.code}: ${secret}. This is not a delivery or login code.`,
      },
    });
    if (kind === "delivery") s.deliveryCodeStatus = "queued";
    await putShipment(s);
    return { queued: true, expires };
  }
  async function checkCode(s, kind, secret) {
    const p = await db
      .prepare("SELECT * FROM dispatch_codes WHERE shipment_id=? AND kind=?")
      .get(s.id, kind);
    if (
      !p ||
      p.used ||
      p.expires <= now() ||
      p.attempts >= 5 ||
      p.recipient_hash !== hash(s.phone) ||
      (kind === "delivery" && p.assignment !== s.assignmentVersion)
    )
      return { _error: "Code expired, replaced, used or locked.", status: 401 };
    await db
      .prepare(
        "UPDATE dispatch_codes SET attempts=attempts+1 WHERE shipment_id=? AND kind=?",
      )
      .run(s.id, kind);
    if (!equal(p.hash, hash(p.salt + String(secret))))
      return { _error: "Incorrect code.", status: 401 };
    await db
      .prepare(
        "UPDATE dispatch_codes SET used=1 WHERE shipment_id=? AND kind=?",
      )
      .run(s.id, kind);
    return { valid: true };
  }
  const api = {
    config,
    outbox,
    publicView: dispatchPublic,
    // Caller must supply a server-priced, server-created shipment. This never accepts a browser payload.
    async initialize(
      s,
      { vendorId, allowedVehicles, pickupCoordinates, register, registered },
    ) {
      outbox.crypto.seal({ preflight: true });
      if (
        s.workflowVersion !== 3 ||
        s.status !== "Created" ||
        !vendorId ||
        !Array.isArray(allowedVehicles) ||
        !allowedVehicles.length ||
        allowedVehicles.some((v) => !vehicles.includes(v)) ||
        !validFix(pickupCoordinates, 86400000)
      )
        fail(
          "A new shipment, vendor, suitable vehicles and confirmed pickup coordinates are required.",
          400,
        );
      return tx(async () => {
        let current = await getShipment(s.id);
        if (register) {
          if (current) fail("Shipment reference already exists.");
          await register();
          current = await getShipment(s.id);
        }
        if (
          !current ||
          current.workflowVersion !== 3 ||
          current.status !== "Created"
        )
          fail("Only a new, unassigned shipment can enter this workflow.");
        const vendor = await db
            .prepare("SELECT * FROM vendor_accounts WHERE id=?")
            .get(vendorId),
          row = await db
            .prepare("SELECT owner FROM shipments WHERE id=?")
            .get(s.id);
        if (!vendor || vendor.suspended || vendor.owner_key !== row?.owner)
          fail("Shipment owner does not match vendor.", 403);
        s = structuredClone(current);
        Object.assign(s, {
          workflowVersion: 5,
          vendorId,
          version: 0,
          assignmentVersion: 0,
          actors: {},
          custodian: "vendor",
          location: null,
          locationConsent: null,
          recipientVerifiedAt: null,
          verifiedRecipientHash: null,
          deliveryCodeStatus: null,
          incidentOpen: false,
          allowedVehicles,
          pickupCoordinates: { ...pickupCoordinates },
          tracking: { revoked: false, expiresAt: null },
          events: [],
        });
        await db
          .prepare("INSERT INTO dispatch_jobs VALUES (?,0,?,'waiting-payment')")
          .run(s.id, now());
        const result = await event(s, "Shipment created", {
          kind: "vendor",
          id: vendorId,
        });
        if (registered) await registered(result);
        return result;
      });
    },
    async position(actor, fix) {
      return tx(async () => {
        await authenticated(actor);
        if (actor.kind !== "rider") fail("Rider account required.", 403);
        if (fix.stop === true) {
          await db
            .prepare("DELETE FROM dispatch_positions WHERE rider_id=?")
            .run(actor.id);
          await db
            .prepare(
              "UPDATE dispatch_offers SET state='withdrawn' WHERE rider_id=? AND state='pending'",
            )
            .run(actor.id);
          for (const row of await db
            .prepare("SELECT payload FROM shipments")
            .all()) {
            const s = JSON.parse(row.payload);
            if (
              s.workflowVersion === 5 &&
              s.locationConsent?.actor === actor.id
            ) {
              s.location = null;
              s.locationConsent = null;
              await putShipment(s);
            }
          }
          return { sharing: false };
        }
        if (fix.consent !== true || !validFix(fix))
          fail("Recent accurate GPS and explicit consent are required.", 400);
        await db
          .prepare(
            "INSERT INTO dispatch_positions VALUES (?,?,?,?,?,?,?) ON CONFLICT(rider_id) DO UPDATE SET session_hash=excluded.session_hash,lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,observed=excluded.observed,expires=excluded.expires",
          )
          .run(
            actor.id,
            actor.sessionHash,
            fix.lat,
            fix.lng,
            fix.accuracy,
            fix.observedAt,
            now() + config.gpsAge,
          );
        return { sharing: true, expiresAt: now() + config.gpsAge };
      });
    },
    async search(id) {
      return tx(async () => {
        const s = await load(id),
          job = await db
            .prepare("SELECT * FROM dispatch_jobs WHERE shipment_id=?")
            .get(id);
        if (
          s.status !== "Shipment created" ||
          s.incidentOpen ||
          s.payment?.status !== "paid"
        )
          return { offered: 0, reason: "not-dispatchable" };
        if (job.next_at > now()) return { offered: 0, reason: "waiting" };
        await db
          .prepare(
            "UPDATE dispatch_offers SET state='expired' WHERE shipment_id=? AND state='pending' AND expires<=?",
          )
          .run(id, now());
        if (job.round >= config.maxRounds) {
          await db
            .prepare(
              "UPDATE dispatch_jobs SET state='needs-attention' WHERE shipment_id=?",
            )
            .run(id);
          return { offered: 0, reason: "needs-attention" };
        }
        const round = job.round + 1,
          radius = Math.min(100, config.radius * 2 ** (round - 1));
        let offered = 0;
        for (const r of await db
          .prepare(
            "SELECT id FROM rider_profiles WHERE identity_status='approved'",
          )
          .all()) {
          if (!(await eligible(r.id, s, radius))) continue;
          const declined = await db
            .prepare(
              "SELECT id FROM dispatch_offers WHERE shipment_id=? AND rider_id=? AND state='declined'",
            )
            .get(id, r.id);
          if (declined) continue;
          const offerId = randomUUID();
          await db
            .prepare("INSERT INTO dispatch_offers VALUES (?,?,?,?,?,?,?)")
            .run(
              offerId,
              id,
              r.id,
              round,
              "pending",
              now() + config.offerTtl,
              now(),
            );
          await db
            .prepare("INSERT OR IGNORE INTO dispatch_inbox VALUES (?,?,?,?,?)")
            .run(
              randomUUID(),
              r.id,
              id,
              `Delivery offer · round ${round}`,
              now(),
            );
          await outbox.enqueue({
            dedupe: `offer:${offerId}`,
            kind: "offer",
            shipmentId: id,
            recipientId: r.id,
            payload: {
              offerId,
              radius,
              title: "Delivery near your pickup area",
              body: "Open SendRack to review the package and earnings.",
            },
          });
          offered++;
        }
        await db
          .prepare(
            "UPDATE dispatch_jobs SET round=?,next_at=?,state='searching' WHERE shipment_id=?",
          )
          .run(round, now() + config.offerTtl, id);
        return { offered, round, radius };
      });
    },
    async offers(actor) {
      return db.withRequest("GET", async () => {
        await authenticated(actor);
        const list = [];
        for (const o of await db
          .prepare(
            "SELECT * FROM dispatch_offers WHERE rider_id=? AND state='pending' AND expires>?",
          )
          .all(actor.id, now())) {
          const s = await load(o.shipment_id);
          if (
            s.status === "Shipment created" &&
            !s.incidentOpen &&
            s.payment?.status === "paid" &&
            (await eligible(
              actor.id,
              s,
              Math.min(100, config.radius * 2 ** (o.round - 1)),
            ))
          )
            list.push({
              offerId: o.id,
              shipmentId: s.id,
              pickupArea: s.pickupCommunity || s.origin,
              origin: s.origin,
              originState: s.originState,
              destination: s.destination,
              destinationState: s.destinationState,
              description: s.description,
              allowedVehicles: s.allowedVehicles,
              earningsKobo: s.fees.pickup,
              expiresAt: o.expires,
            });
        }
        return list;
      });
    },
    async accept(actor, offerId, key) {
      return idempotent(actor, key, `accept:${offerId}`, async () => {
        if (actor.kind !== "rider") fail("Rider account required.", 403);
        const o = await db
          .prepare("SELECT * FROM dispatch_offers WHERE id=? AND rider_id=?")
          .get(offerId, actor.id);
        if (!o) fail("Offer not found.", 404);
        const s = await load(o.shipment_id);
        if (
          o.state !== "pending" ||
          o.expires <= now() ||
          s.status !== "Shipment created" ||
          s.incidentOpen ||
          s.payment?.status !== "paid"
        )
          fail("Offer expired or already assigned.");
        if (
          !(await eligible(
            actor.id,
            s,
            Math.min(100, config.radius * 2 ** (o.round - 1)),
          ))
        )
          fail(
            "Location, vehicle, identity or capacity no longer qualifies.",
            403,
          );
        s.actors.pickup = { id: actor.id };
        s.assignmentVersion++;
        await db
          .prepare(
            "UPDATE dispatch_offers SET state=CASE WHEN id=? THEN 'accepted' ELSE 'withdrawn' END WHERE shipment_id=? AND state='pending'",
          )
          .run(offerId, s.id);
        await db
          .prepare(
            "UPDATE dispatch_jobs SET state='assigned' WHERE shipment_id=?",
          )
          .run(s.id);
        await event(s, "Rider assigned", actor);
        return { shipmentId: s.id, status: s.status };
      });
    },
    async decline(actor, offerId, key) {
      return idempotent(actor, key, `decline:${offerId}`, async () => {
        const result = await db
          .prepare(
            "UPDATE dispatch_offers SET state='declined' WHERE id=? AND rider_id=? AND state='pending'",
          )
          .run(offerId, actor.id);
        if (!result.changes) fail("Offer unavailable.");
        return { declined: true };
      });
    },
    async view(actor, id) {
      return db.withRequest("GET", async () => {
        await authenticated(actor);
        const s = await load(id),
          leg = participant(s, actor),
          current = holder(s) === actor.id;
        const safe = {
          id: s.id,
          jobLeg: leg,
          carrying: current,
          code: s.code,
          workflowVersion: 5,
          status: s.status,
          custodian: s.custodian,
          version: s.version,
          deliveryType: s.deliveryType,
          business: s.business,
          origin: s.origin,
          originState: s.originState,
          destination: s.destination,
          destinationState: s.destinationState,
          description: s.description,
          allowedVehicles: s.allowedVehicles,
          earningsKobo: leg === "vendor" ? null : s.fees[leg],
          events: s.events,
          customerTracking: dispatchPublic(s, now()),
        };
        if (leg === "vendor")
          Object.assign(safe, {
            recipient: s.recipient,
            phone: s.phone,
            address: s.address,
            pickupAddress: s.pickupAddress,
            fees: s.fees,
            pricingBreakdown: s.pricingBreakdown,
            payment: s.payment,
          });
        else if (leg === "pickup" && ["vendor", "pickup"].includes(s.custodian))
          safe.pickupAddress = s.pickupAddress;
        if (current && leg === finalLeg(s))
          Object.assign(safe, {
            recipient: s.recipient,
            phone: s.phone,
            address: s.address,
          });
        return safe;
      });
    },
    async progress(actor, id, action, key) {
      return idempotent(actor, key, `progress:${id}:${action}`, async () => {
        const s = await load(id);
        const leg = participant(s, actor);
        if (action === "travel") {
          expect(s, "Rider assigned", "pickup", actor);
          await event(s, "Rider travelling to pickup", actor);
        } else if (action === "arrive") {
          expect(s, "Rider travelling to pickup", "pickup", actor);
          await event(s, "Rider arrived", actor);
        } else if (action === "depart-carrier") {
          expect(s, "Carrier received parcel", "carrier", actor);
          await event(s, "In transit", actor);
        } else if (action === "arrive-carrier") {
          expect(s, "In transit", "carrier", actor);
          await event(s, "Carrier arrived", actor);
        } else if (action === "depart-final") {
          expect(
            s,
            s.deliveryType === "interstate"
              ? "Last-mile rider received parcel"
              : "Parcel collected",
            finalLeg(s),
            actor,
          );
          await event(s, "Out for delivery", actor);
          if (s.deliveryType === "intrastate") await code(s, "delivery");
        } else fail("Unknown checkpoint.", 400);
        return { status: s.status, custodian: s.custodian, leg };
      });
    },
    async initiateHandover(actor, id, toId, key) {
      return idempotent(actor, key, `handover:${id}:${toId}`, async () => {
        const s = await load(id),
          leg = participant(s, actor);
        if (s.incidentOpen || holder(s) !== actor.id)
          fail("Only the current holder may offer a transfer.", 403);
        const replacement = await db
          .prepare("SELECT * FROM dispatch_replacements WHERE shipment_id=?")
          .get(id);
        const next =
          replacement &&
          replacement.expires > now() &&
          replacement.expected_version === s.version &&
          replacement.rider_id === toId &&
          leg === finalLeg(s) &&
          s.status === "Out for delivery"
            ? leg
            : s.status === "Rider arrived" && leg === "vendor"
              ? "pickup"
              : s.deliveryType === "interstate" &&
                  s.status === "Parcel collected" &&
                  leg === "pickup"
                ? "carrier"
                : s.deliveryType === "interstate" &&
                    s.status === "Carrier arrived" &&
                    leg === "carrier"
                  ? "lastmile"
                  : null;
        if (!next) fail("Handover is not allowed at this checkpoint.");
        if (next === "pickup" && !replacement && s.actors.pickup?.id !== toId)
          fail("Transfer must be to the assigned pickup rider.", 403);
        if (
          toId === actor.id ||
          (Object.values(s.actors).some((a) => a.id === toId) &&
            next !== "pickup")
        )
          fail("Each custody leg requires a different handler.");
        const r = await db
          .prepare("SELECT * FROM rider_profiles WHERE id=?")
          .get(toId);
        if (
          !r ||
          r.suspended ||
          r.identity_status !== "approved" ||
          r.identity_format < 4
        )
          fail("Intended handler needs an approved identity submission.", 403);
        if (
          next === "carrier" &&
          !(await db
            .prepare(
              "SELECT * FROM dispatch_permissions WHERE rider_id=? AND role='carrier'",
            )
            .get(toId))
        )
          fail("Carrier permission is required.", 403);
        const pending = await db
          .prepare(
            "SELECT * FROM dispatch_handovers WHERE shipment_id=? AND state='pending'",
          )
          .get(id);
        if (pending && pending.expires > now())
          fail("A handover is already awaiting acceptance.");
        await db
          .prepare(
            "UPDATE dispatch_handovers SET state='expired' WHERE shipment_id=? AND state='pending'",
          )
          .run(id);
        const transfer = randomUUID();
        await db
          .prepare(
            "INSERT INTO dispatch_handovers VALUES (?,?,?,?,?,?,?,'pending',?,?,NULL)",
          )
          .run(
            transfer,
            id,
            actor.id,
            toId,
            leg,
            next,
            s.version,
            now() + 900000,
            now(),
          );
        return {
          handoverId: transfer,
          intendedRecipient: toId,
          expiresAt: now() + 900000,
        };
      });
    },
    async acceptHandover(actor, handoverId, key) {
      return idempotent(actor, key, `receive:${handoverId}`, async () => {
        const h = await db
          .prepare("SELECT * FROM dispatch_handovers WHERE id=?")
          .get(handoverId);
        if (!h || actor.kind !== "rider" || h.to_id !== actor.id)
          fail("Handover not found for this handler.", 403);
        const s = await load(h.shipment_id);
        if (
          h.state !== "pending" ||
          h.expires <= now() ||
          h.expected_version !== s.version ||
          holder(s) !== h.from_id ||
          s.incidentOpen
        )
          fail("Transfer expired, changed or already accepted.");
        if (
          h.to_leg === "carrier" &&
          !(await db
            .prepare(
              "SELECT * FROM dispatch_permissions WHERE rider_id=? AND role='carrier'",
            )
            .get(actor.id))
        )
          fail("Carrier permission was revoked.", 403);
        const oldId = s.actors[h.to_leg]?.id;
        s.actors[h.to_leg] = { id: actor.id };
        if (h.to_leg === finalLeg(s)) {
          s.assignmentVersion++;
          await invalidate(s);
        }
        await db
          .prepare(
            "UPDATE dispatch_handovers SET state='accepted',accepted=? WHERE id=?",
          )
          .run(now(), h.id);
        const status = {
          pickup: "Parcel collected",
          carrier: "Carrier received parcel",
          lastmile: "Last-mile rider received parcel",
        }[h.to_leg];
        await event(s, status, actor, { to: h.to_leg });
        if (oldId && oldId !== actor.id) {
          s.location = null;
          s.locationConsent = null;
          await db
            .prepare("DELETE FROM dispatch_replacements WHERE shipment_id=?")
            .run(s.id);
          await putShipment(s);
        }
        if (h.to_leg === "lastmile") await code(s, "delivery");
        return { status: s.status, custodian: s.custodian };
      });
    },
    async rejectHandover(actor, handoverId, key) {
      return idempotent(actor, key, `reject:${handoverId}`, async () => {
        const h = await db
          .prepare("SELECT * FROM dispatch_handovers WHERE id=?")
          .get(handoverId);
        if (!h || h.to_id !== actor.id || h.state !== "pending")
          fail("No pending transfer to this handler.", 403);
        await db
          .prepare("UPDATE dispatch_handovers SET state='rejected' WHERE id=?")
          .run(h.id);
        return { rejected: true, custodyChanged: false };
      });
    },
    // HTTP adapter must resolve this secret to the shipment; never accept a shipment ID as customer authority.
    async customer(trackingToken, action, input = {}) {
      return tx(async () => {
        if (!/^[a-f0-9]{64}$/.test(trackingToken || ""))
          fail("Tracking link unavailable.", 404);
        const row = await db
          .prepare("SELECT payload FROM shipments WHERE public_hash=?")
          .get(hash(trackingToken));
        const s = row ? JSON.parse(row.payload) : null;
        if (!s || !dispatchPublic(s, now()) || !active(s))
          fail("Tracking link unavailable.", 404);
        if (action === "request-contact-code") return code(s, "contact");
        if (action === "verify-contact") {
          const checked = await checkCode(s, "contact", input.code);
          if (checked._error) return checked;
          s.recipientVerifiedAt = now();
          s.verifiedRecipientHash = hash(s.phone);
          await putShipment(s);
          if (
            s.custodian === finalLeg(s) &&
            (s.deliveryType === "interstate" || s.status === "Out for delivery")
          )
            await code(s, "delivery");
          return { verified: true };
        }
        fail("Unsupported customer action.", 400);
      }).then((result) => {
        if (result?._error) throw problem(result._error, result.status);
        return result;
      });
    },
    async renewCode(actor, id, key) {
      return idempotent(actor, key, `renew:${id}`, async () => {
        const s = await load(id);
        if (
          participant(s, actor) !== finalLeg(s) ||
          s.custodian !== finalLeg(s) ||
          s.incidentOpen ||
          !active(s) ||
          (s.deliveryType === "intrastate" && s.status !== "Out for delivery")
        )
          fail(
            "Only the current final handler can request customer-code renewal.",
            403,
          );
        return code(s, "delivery");
      });
    },
    async complete(actor, id, secret, key) {
      return idempotent(actor, key, `complete:${id}`, async () => {
        const s = await load(id);
        expect(s, "Out for delivery", finalLeg(s), actor);
        if (s.custodian !== finalLeg(s) || s.payment?.status !== "paid")
          fail("Paid final-delivery custody is required.");
        const result = await checkCode(s, "delivery", secret);
        if (result._error) return result;
        await event(s, "Delivered", actor, { to: "customer" });
        s.tracking.expiresAt = now() + 86400000;
        s.deliveryCodeStatus = "used";
        await putShipment(s);
        await creditEarnings(s);
        return {
          status: "Delivered",
          payoutStatus: "separate-provider-confirmation-required",
        };
      });
    },
    async incident(actor, id, kind, key) {
      return idempotent(actor, key, `incident:${id}:${kind}`, async () => {
        const s = await load(id);
        participant(s, actor);
        if (
          !active(s) ||
          !["damage", "wrong-recipient", "dispute", "cancel-request"].includes(
            kind,
          )
        )
          fail("Unsupported incident.", 400);
        const incidentId = randomUUID();
        await db
          .prepare(
            "INSERT INTO dispatch_incidents VALUES (?,?,?,?,'open',?,NULL)",
          )
          .run(incidentId, id, actor.id, kind, now());
        s.incidentOpen = true;
        s.location = null;
        s.locationConsent = null;
        await invalidate(s);
        await event(s, s.status, actor);
        return { incidentId, paused: true, custodyChanged: false };
      });
    },
    async shareJobLocation(actor, id, fix) {
      return tx(async () => {
        await authenticated(actor);
        const s = await load(id),
          leg = participant(s, actor);
        if (
          holder(s) !== actor.id ||
          leg === "vendor" ||
          !active(s) ||
          s.incidentOpen
        )
          fail("Only the current handler can share GPS.", 403);
        if (fix.stop === true) {
          s.location = null;
          s.locationConsent = null;
        } else {
          if (fix.consent !== true || !validFix(fix))
            fail("Explicit consent and recent accurate GPS are required.", 400);
          s.locationConsent = {
            actor: actor.id,
            sessionHash: actor.sessionHash,
            leg,
          };
          s.location = {
            lat: fix.lat,
            lng: fix.lng,
            accuracy: fix.accuracy,
            at: new Date(fix.observedAt).toISOString(),
            leg,
          };
        }
        await putShipment(s);
        return { shared: !!s.locationConsent };
      });
    },
    async inbox(actor) {
      return db.withRequest("GET", async () => {
        await authenticated(actor);
        return db
          .prepare(
            "SELECT id,shipment_id,title,created FROM dispatch_inbox WHERE rider_id=? ORDER BY created DESC LIMIT 100",
          )
          .all(actor.id);
      });
    },
    async operations(context) {
      const staff = await authorizeStaff(context, "dispatch.read");
      if (!staff?.id || staff.mfa !== true) fail("Staff MFA required.", 403);
      return db.withRequest("GET", async () => ({
        jobs: await db
          .prepare("SELECT * FROM dispatch_jobs ORDER BY next_at LIMIT 200")
          .all(),
        notifications: await db
          .prepare(
            "SELECT id,shipment_id,kind,state,attempts,created,updated,last_error FROM notification_outbox WHERE state IN ('pending','failed') ORDER BY created LIMIT 200",
          )
          .all(),
        handovers: await db
          .prepare(
            "SELECT * FROM dispatch_handovers WHERE state='pending' ORDER BY created LIMIT 200",
          )
          .all(),
        incidents: await db
          .prepare(
            "SELECT * FROM dispatch_incidents WHERE state='open' ORDER BY created LIMIT 200",
          )
          .all(),
      }));
    },
    async operate(context, id, action, input = {}) {
      const staff = await authorizeStaff(context, "dispatch.manage");
      if (!staff?.id || staff.mfa !== true) fail("Staff MFA required.", 403);
      return tx(async () => {
        const s = await load(id),
          actor = { kind: "staff", id: staff.id };
        if (action === "cancel") {
          if (s.custodian !== "vendor" || !active(s))
            fail(
              "Physical custody requires a documented return process before cancellation.",
            );
          await invalidate(s);
          s.tracking.revoked = true;
          await db
            .prepare(
              "UPDATE dispatch_offers SET state='withdrawn' WHERE shipment_id=? AND state='pending'",
            )
            .run(id);
          await db
            .prepare(
              "UPDATE dispatch_handovers SET state='cancelled' WHERE shipment_id=? AND state='pending'",
            )
            .run(id);
          await db
            .prepare(
              "UPDATE dispatch_jobs SET state='cancelled' WHERE shipment_id=?",
            )
            .run(id);
          await event(s, "Cancelled", actor);
        } else if (action === "reassign-pickup") {
          if (
            s.custodian !== "vendor" ||
            !s.actors.pickup ||
            !active(s) ||
            s.incidentOpen
          )
            fail("Only a pre-collection assignment can be reopened.");
          s.actors = {};
          s.assignmentVersion++;
          await invalidate(s);
          await db
            .prepare(
              "UPDATE dispatch_offers SET state='withdrawn' WHERE shipment_id=? AND state='pending'",
            )
            .run(id);
          await db
            .prepare(
              "UPDATE dispatch_handovers SET state='cancelled' WHERE shipment_id=? AND state='pending'",
            )
            .run(id);
          await db
            .prepare(
              "UPDATE dispatch_jobs SET round=0,next_at=?,state='searching' WHERE shipment_id=?",
            )
            .run(now(), id);
          await event(s, "Shipment created", actor);
        } else if (action === "approve-final-replacement") {
          if (
            s.status !== "Out for delivery" ||
            s.custodian !== finalLeg(s) ||
            s.incidentOpen ||
            typeof input.riderId !== "string"
          )
            fail("Final-leg replacement requires an active final journey.");
          const r = await db
            .prepare("SELECT * FROM rider_profiles WHERE id=?")
            .get(input.riderId);
          if (
            !r ||
            r.suspended ||
            r.identity_status !== "approved" ||
            r.identity_format < 4 ||
            Object.values(s.actors).some((a) => a.id === r.id)
          )
            fail("A different approved handler is required.", 403);
          await invalidate(s);
          await event(s, s.status, actor);
          await db
            .prepare(
              "INSERT INTO dispatch_replacements VALUES (?,?,?,?,?) ON CONFLICT(shipment_id) DO UPDATE SET rider_id=excluded.rider_id,expected_version=excluded.expected_version,approved_by=excluded.approved_by,expires=excluded.expires",
            )
            .run(id, r.id, s.version, staff.id, now() + 900000);
        } else if (action === "change-recipient") {
          if (!/^0[789][0-9]{9}$/.test(input.phone || "") || !active(s))
            fail(
              "A valid recipient phone and active shipment are required.",
              400,
            );
          await invalidate(s);
          await db
            .prepare("UPDATE dispatch_codes SET used=1 WHERE shipment_id=?")
            .run(id);
          s.phone = input.phone;
          s.recipientVerifiedAt = null;
          s.verifiedRecipientHash = null;
          s.assignmentVersion++;
          await event(s, s.status, actor);
        } else if (action === "revoke-tracking") {
          s.tracking.revoked = true;
          await invalidate(s);
          s.location = null;
          s.locationConsent = null;
          await event(s, s.status, actor);
        } else if (action === "resolve-incident") {
          if (input.resolution !== "continue-with-current-holder")
            fail("Resolution must explicitly preserve physical custody.", 400);
          await db
            .prepare(
              "UPDATE dispatch_incidents SET state='resolved',resolved=? WHERE shipment_id=? AND state='open'",
            )
            .run(now(), id);
          s.incidentOpen = false;
          await event(s, s.status, actor);
        } else if (action === "retry-notifications") {
          await db
            .prepare(
              "UPDATE notification_outbox SET state='pending',attempts=0,available_at=?,lease_until=0,lease_token=NULL,last_error=NULL WHERE shipment_id=? AND state='failed'",
            )
            .run(now(), id);
          await event(s, s.status, actor);
        } else if (action === "grant-carrier") {
          const r = await db
            .prepare("SELECT * FROM rider_profiles WHERE id=?")
            .get(input.riderId);
          if (!r || r.identity_status !== "approved" || r.suspended)
            fail("An approved active handler is required.", 403);
          await db
            .prepare(
              "INSERT OR IGNORE INTO dispatch_permissions VALUES (?,?,?,?)",
            )
            .run(input.riderId, "carrier", staff.id, now());
          await event(s, s.status, actor);
        } else fail("Unsupported operation.", 400);
        return { status: s.status, custodian: s.custodian };
      });
    },
    async handovers(actor) {
      return db.withRequest("GET", async () => {
        await authenticated(actor);
        return db
          .prepare(
            "SELECT id,shipment_id,from_id,to_id,from_leg,to_leg,state,expires,created FROM dispatch_handovers WHERE (from_id=? OR to_id=?) AND state='pending' AND expires>? ORDER BY created DESC LIMIT 100",
          )
          .all(actor.id, actor.id, now());
      });
    },
    async sweep() {
      const ids = await db.withRequest("GET", () =>
        db
          .prepare(
            "SELECT shipment_id FROM dispatch_jobs WHERE state IN ('waiting-payment','searching') AND next_at<=? ORDER BY next_at LIMIT 50",
          )
          .all(now()),
      );
      for (const row of ids) {
        const result = await api.search(row.shipment_id);
        if (result.reason === "not-dispatchable")
          await db.withRequest("POST", () =>
            db
              .prepare("UPDATE dispatch_jobs SET next_at=? WHERE shipment_id=?")
              .run(now() + 60000, row.shipment_id),
          );
      }
      return outbox.tick(20);
    },
  };
  return api;
}
