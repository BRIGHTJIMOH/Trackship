import { randomUUID, randomBytes, createHash } from "node:crypto";
import { dispatchWorkflow } from "./dispatch-v5.mjs";
import { dispatchNotificationProviders } from "./dispatch-notifications.mjs";
import { dispatchStepup } from "./dispatch-stepup.mjs";
import { validateTransport } from "../web/lifecycle.mjs";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const clean = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
export async function dispatchHttp(
  db,
  {
    env,
    body,
    vendor,
    rider,
    admin,
    catalog,
    providers,
    getShipment,
    putShipment,
    creditEarnings,
  },
) {
  const enabled =
    env.SENDRACK_DISPATCH_PREVIEW === "true" && env.NODE_ENV !== "production";
  const capabilities = {
    enabled,
    productionReady: false,
    reason:
      env.NODE_ENV === "production"
        ? "Production activation awaits staff-security and device/recovery review."
        : "Dispatch preview is not enabled.",
  };
  if (!enabled)
    return {
      enabled: false,
      async route(req, res, url, send) {
        if (url.pathname === "/api/v5/capabilities" && req.method === "GET") {
          send(200, capabilities);
          return true;
        }
        if (url.pathname.startsWith("/api/v5/")) {
          send(503, { error: capabilities.reason });
          return true;
        }
        return false;
      },
    };
  if (
    !/^[a-f0-9]{64}$/i.test(env.NOTIFICATION_ENCRYPTION_KEY || "") ||
    !/^[A-Z2-7]{32,128}$/.test(env.DISPATCH_OWNER_TOTP_SECRET || "")
  )
    throw new Error(
      "Dispatch preview requires separate notification encryption and owner authenticator configuration.",
    );
  const stepup = await dispatchStepup(db, { env, admin });
  await db.exec(`CREATE TABLE IF NOT EXISTS dispatch_creations(vendor_id TEXT,request_id TEXT,shipment_id TEXT,body_hash TEXT,PRIMARY KEY(vendor_id,request_id));
 CREATE TABLE IF NOT EXISTS dispatch_location_consents(rider_id TEXT PRIMARY KEY,session_hash TEXT,nonce TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS dispatch_installations(id TEXT PRIMARY KEY,rider_id TEXT,platform TEXT,token_cipher TEXT,updated INTEGER,revoked INTEGER DEFAULT 0,session_hash TEXT);`);
  const push = dispatchNotificationProviders({ env });
  const engine = await dispatchWorkflow(db, {
    env,
    getShipment,
    putShipment,
    creditEarnings,
    authorizeStaff: stepup.authorize,
    sendNotification: async (row, payload) => {
      if (row.kind !== "offer") {
        await providers.sms(payload.phone, payload.message);
        return;
      }
      const devices = await db.withRequest("GET", () =>
        db
          .prepare(
            "SELECT i.* FROM dispatch_installations i JOIN rider_sessions s ON s.token_hash=i.session_hash WHERE i.rider_id=? AND i.revoked=0 AND s.expires>?",
          )
          .all(row.recipient_id, Date.now()),
      );
      if (!devices.length)
        fail("No native installation registered; in-app inbox retained.", 503);
      const outcomes = await Promise.allSettled(
        devices.map(async (d) => {
          const token = engine.outbox.crypto.open(d.token_cipher).token;
          return d.platform === "android"
            ? push.fcm(token, row.id, payload)
            : push.apns(token, row.id, payload);
        }),
      );
      if (!outcomes.some((o) => o.status === "fulfilled"))
        fail("Push unavailable; in-app inbox retained.", 503);
    },
  });
  async function actor(req) {
    const v = await vendor(req);
    if (v)
      return {
        kind: "vendor",
        id: v.id,
        sessionHash: hash(req.headers.authorization.slice(7)),
      };
    const r = await rider(req);
    return { kind: "rider", id: r.id, sessionHash: r.sessionHash };
  }
  const key = (p) => {
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(p.requestId || ""))
      fail("A unique request ID is required.");
    return p.requestId;
  };
  async function create(req, p) {
    const v = await vendor(req);
    if (!v) fail("Vendor account required.", 403);
    if (v.identity_status !== "approved")
      fail("Complete identity review before creating a preview delivery.", 403);
    const requestId = key(p);
    await stepup.limit("create:" + v.id, 20);
    const fingerprint = hash(JSON.stringify(p)),
      previous = await db
        .prepare(
          "SELECT * FROM dispatch_creations WHERE vendor_id=? AND request_id=?",
        )
        .get(v.id, requestId);
    if (previous) {
      if (previous.body_hash !== fingerprint)
        fail("Request ID was used for different shipment details.", 409);
      return vendorView(await getShipment(previous.shipment_id), req);
    }
    const route = await catalog.get(p.routeId);
    if (!route?.active) fail("Choose an available delivery route.");
    const profile = JSON.parse(v.profile || "{}");
    const fields = {
      routeId: route.id,
      origin: route.origin,
      originState: route.originState,
      destination: route.destination,
      destinationState: route.destinationState,
      deliveryType: route.deliveryType,
      service: "Standard",
      sender: profile.businessName || profile.ownerName,
      business: profile.businessName || profile.ownerName,
      recipient: clean(p.recipient, 80),
      phone: clean(p.phone, 20),
      description: clean(p.description, 160),
      address: clean(p.address, 240),
      pickupAddress: clean(profile.pickupAddress, 240),
      pickupCommunity: clean(profile.community, 80),
    };
    const quote = await catalog.quote(route.id, fields);
    if (
      p.routeRevision !== quote.routeRevision ||
      p.pricingRevision !== quote.pricingRevision ||
      p.totalKobo !== quote.totalKobo
    )
      fail(
        "Review the current delivery charge and platform fee before confirming.",
        409,
      );
    Object.assign(fields, {
      deliveryFee: String(quote.totalKobo / 100),
      pickupFee: String(quote.fees.pickup / 100),
      carrierFee: String(quote.fees.carrier / 100),
      lastMileFee: String(quote.fees.lastmile / 100),
      pricingBreakdown: quote,
    });
    const errors = validateTransport(fields);
    if (errors.length) fail(errors[0]);
    if (
      !["bicycle", "motorcycle", "car", "van", "truck"].includes(
        p.requiredVehicle,
      )
    )
      fail("Select a vehicle suitable for this parcel.");
    const id = randomUUID(),
      publicToken = randomBytes(32).toString("hex"),
      s = {
        ...fields,
        id,
        publicToken,
        code: "TS-" + id.slice(0, 8).toUpperCase(),
        workflowVersion: 3,
        status: "Created",
        createdAt: new Date().toISOString(),
        events: [],
        actors: {},
        jobTokens: {},
        fees: quote.fees,
        payment: { status: "unpaid", amount: quote.totalKobo, mode: null },
      };
    const stored = await engine.initialize(s, {
      vendorId: v.id,
      allowedVehicles: [p.requiredVehicle],
      pickupCoordinates: p.pickupCoordinates,
      register: () =>
        db
          .prepare(
            "INSERT INTO shipments(id,owner,public_hash,payload,rider_hash) VALUES (?,?,?,?,NULL)",
          )
          .run(id, v.owner_key, hash(publicToken), JSON.stringify(s)),
      registered: () =>
        db
          .prepare("INSERT INTO dispatch_creations VALUES (?,?,?,?)")
          .run(v.id, requestId, id, fingerprint),
    });
    return vendorView(stored, req);
  }
  function vendorView(s, req) {
    const { jobTokens, riderToken, ...safe } = s;
    return { ...safe, trackingPath: "/t/" + s.publicToken };
  }
  async function locationConsent(a, p) {
    const grant = await db
      .prepare(
        "SELECT * FROM dispatch_location_consents WHERE rider_id=? AND session_hash=?",
      )
      .get(a.id, a.sessionHash);
    if (
      !grant ||
      grant.expires <= Date.now() ||
      typeof p.consentNonce !== "string" ||
      grant.nonce !== hash(p.consentNonce)
    )
      fail(
        "Location consent was withdrawn or expired. Start sharing explicitly again.",
        403,
      );
  }
  async function route(req, res, url, send) {
    const path = url.pathname;
    if (!path.startsWith("/api/v5/")) return false;
    if (path === "/api/v5/capabilities" && req.method === "GET") {
      send(200, {
        ...capabilities,
        reason: null,
        fcmConfigured: push.fcmReady,
        apnsConfigured: push.apnsReady,
      });
      return true;
    }
    if (path === "/api/v5/admin/unlock" && req.method === "POST") {
      send(200, await stepup.unlock(req, (await body(req, 4096)).code));
      return true;
    }
    if (path === "/api/v5/admin/operations" && req.method === "GET") {
      send(200, await engine.operations(req));
      return true;
    }
    const adminAction = path.match(
      /^\/api\/v5\/admin\/shipments\/([a-f0-9-]{36})$/,
    );
    if (adminAction && req.method === "POST") {
      const p = await body(req, 4096);
      const result = await engine.operate(req, adminAction[1], p.action, p);
      send(200, result);
      return true;
    }
    const customer = path.match(/^\/api\/v5\/customer\/([a-f0-9]{64})$/);
    if (customer && req.method === "POST") {
      await stepup.limit("customer:" + hash(customer[1]), 20, 600000);
      const p = await body(req, 4096);
      send(200, await engine.customer(customer[1], p.action, p));
      return true;
    }
    const a = await actor(req);
    if (req.method === "POST") await stepup.limit("write:" + a.id, 80);
    if (path === "/api/v5/session" && req.method === "GET") {
      send(200, { id: a.id, role: a.kind });
      return true;
    }
    if (path === "/api/v5/shipments" && req.method === "POST") {
      send(201, await create(req, await body(req, 8192)));
      return true;
    }
    if (path === "/api/v5/shipments" && req.method === "GET") {
      const records = [];
      for (const row of await db
        .prepare("SELECT payload FROM shipments")
        .all()) {
        const s = JSON.parse(row.payload);
        if (
          s.workflowVersion === 5 &&
          (a.kind === "vendor"
            ? s.vendorId === a.id
            : Object.values(s.actors || {}).some((r) => r.id === a.id))
        )
          records.push(
            a.kind === "vendor"
              ? vendorView(s, req)
              : await engine.view(a, s.id),
          );
      }
      send(200, { shipments: records.slice(-100).reverse() });
      return true;
    }
    if (path === "/api/v5/handovers" && req.method === "GET") {
      send(200, { handovers: await engine.handovers(a) });
      return true;
    }
    if (path === "/api/v5/location/consent" && req.method === "POST") {
      const p = await body(req, 4096);
      if (a.kind !== "rider" || p.consent !== true)
        fail("Explicit rider location consent is required.", 403);
      const nonce = randomBytes(32).toString("hex"),
        expires = Date.now() + 30 * 60000;
      await db
        .prepare(
          "INSERT INTO dispatch_location_consents VALUES (?,?,?,?) ON CONFLICT(rider_id) DO UPDATE SET session_hash=excluded.session_hash,nonce=excluded.nonce,expires=excluded.expires",
        )
        .run(a.id, a.sessionHash, hash(nonce), expires);
      send(200, { nonce, expires });
      return true;
    }
    if (path === "/api/v5/location" && req.method === "POST") {
      const p = await body(req, 4096);
      if (p.stop === true)
        await db
          .prepare(
            "DELETE FROM dispatch_location_consents WHERE rider_id=? AND session_hash=?",
          )
          .run(a.id, a.sessionHash);
      else await locationConsent(a, p);
      send(200, await engine.position(a, p));
      return true;
    }
    if (path === "/api/v5/offers" && req.method === "GET") {
      send(200, { offers: await engine.offers(a) });
      return true;
    }
    if (path === "/api/v5/inbox" && req.method === "GET") {
      send(200, { notifications: await engine.inbox(a) });
      return true;
    }
    const offers = path.match(
      /^\/api\/v5\/offers\/([a-f0-9-]{36})\/(accept|decline)$/,
    );
    if (offers && req.method === "POST") {
      const p = await body(req, 4096);
      send(200, await engine[offers[2]](a, offers[1], key(p)));
      return true;
    }
    const handover = path.match(
      /^\/api\/v5\/handovers\/([a-f0-9-]{36})\/(accept|reject)$/,
    );
    if (handover && req.method === "POST") {
      const p = await body(req, 4096);
      send(
        200,
        await engine[
          handover[2] === "accept" ? "acceptHandover" : "rejectHandover"
        ](a, handover[1], key(p)),
      );
      return true;
    }
    const shipment = path.match(
      /^\/api\/v5\/shipments\/([a-f0-9-]{36})(?:\/(progress|handover|complete|renew-code|incident|location))?$/,
    );
    if (shipment) {
      if (req.method === "GET" && !shipment[2]) {
        send(200, await engine.view(a, shipment[1]));
        return true;
      }
      if (req.method === "POST") {
        const p = await body(req, 4096),
          id = shipment[1];
        let result;
        switch (shipment[2]) {
          case "progress":
            result = await engine.progress(a, id, p.action, key(p));
            break;
          case "handover":
            result = await engine.initiateHandover(a, id, p.toId, key(p));
            break;
          case "complete":
            result = await engine.complete(a, id, p.code, key(p));
            break;
          case "renew-code":
            result = await engine.renewCode(a, id, key(p));
            break;
          case "incident":
            result = await engine.incident(a, id, p.kind, key(p));
            break;
          case "location":
            if (p.stop !== true) await locationConsent(a, p);
            result = await engine.shareJobLocation(a, id, p);
            break;
          default:
            fail("Unknown operation.", 404);
        }
        send(200, result);
        return true;
      }
    }
    if (path === "/api/v5/installations" && req.method === "POST") {
      if (a.kind !== "rider") fail("Rider account required.", 403);
      const p = await body(req, 8192);
      if (
        !/^[a-f0-9-]{36}$/.test(p.installationId || "") ||
        !["android", "ios"].includes(p.platform) ||
        typeof p.token !== "string" ||
        p.token.length < 20 ||
        p.token.length > 4096 ||
        (p.platform === "ios" && !/^[a-f0-9]{64}$/i.test(p.token))
      )
        fail("Invalid native installation.");
      const old = await db
        .prepare("SELECT rider_id FROM dispatch_installations WHERE id=?")
        .get(p.installationId);
      if (old && old.rider_id !== a.id)
        fail("Installation belongs to another account.", 403);
      const count = await db
        .prepare(
          "SELECT COUNT(*) AS total FROM dispatch_installations WHERE rider_id=? AND revoked=0",
        )
        .get(a.id);
      if (!old && count.total >= 10) fail("Installation limit reached.", 429);
      await db
        .prepare(
          "INSERT INTO dispatch_installations VALUES (?,?,?,?,?,0,?) ON CONFLICT(id) DO UPDATE SET platform=excluded.platform,token_cipher=excluded.token_cipher,updated=excluded.updated,session_hash=excluded.session_hash,revoked=0",
        )
        .run(
          p.installationId,
          a.id,
          p.platform,
          engine.outbox.crypto.seal({ token: p.token }),
          Date.now(),
          a.sessionHash,
        );
      send(200, { registered: true });
      return true;
    }
    const installation = path.match(
      /^\/api\/v5\/installations\/([a-f0-9-]{36})$/,
    );
    if (installation && req.method === "DELETE") {
      await db
        .prepare(
          "UPDATE dispatch_installations SET revoked=1,token_cipher='' WHERE id=? AND rider_id=?",
        )
        .run(installation[1], a.id);
      send(200, { revoked: true });
      return true;
    }
    fail("Not found.", 404);
  }
  return { enabled, route, engine, tick: () => engine.sweep() };
}
