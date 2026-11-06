import { createHash } from "node:crypto";
import { publicMapConfig } from "./maps.mjs";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const terminal = new Set(["Delivered", "Cancelled"]);
const text = (value, max = 100) =>
  typeof value === "string" ? value.slice(0, max) : "";
const time = (value) => {
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
};
export const GPS_FRESH_MS = 120000;
export function operationsRecord(
  s,
  {
    now = Date.now(),
    sessions = new Map(),
    suspended = new Set(),
    stalledMs = 2 * 3600000,
  } = {},
) {
  if (!s?.id || terminal.has(s.status)) return null;
  const assigned = s.actors?.[s.custodian],
    location = s.location,
    consent = s.locationConsent;
  const receivedAt =
      location &&
      (s.workflowVersion === 3
        ? location.receivedAt || location.at
        : location.receivedAt),
    observedAt = s.workflowVersion === 3 ? location?.observedAt : location?.at;
  const received = time(receivedAt),
    observed = time(observedAt),
    session = consent?.sessionHash ? sessions.get(consent.sessionHash) : null;
  const validCustody =
    s.deliveryType === "interstate"
      ? ["vendor", "pickup", "carrier", "lastmile"].includes(s.custodian)
      : s.deliveryType === "intrastate"
        ? ["vendor", "pickup"].includes(s.custodian)
        : false;
  const consented =
    validCustody &&
    [3, 5].includes(s.workflowVersion) &&
    !s.incidentOpen &&
    !!assigned?.id &&
    consent?.actor === assigned.id &&
    consent?.leg === s.custodian &&
    session?.rider_id === assigned.id &&
    session.expires > now &&
    !suspended.has(assigned.id);
  const valid =
    consented &&
    location?.leg === s.custodian &&
    Number.isFinite(location.lat) &&
    Math.abs(location.lat) <= 90 &&
    Number.isFinite(location.lng) &&
    Math.abs(location.lng) <= 180 &&
    Number.isFinite(location.accuracy) &&
    location.accuracy >= 0 &&
    location.accuracy <= 5000 &&
    received !== null &&
    received <= now &&
    (observed === null || (observed <= now && observed <= received + 5000));
  const fresh =
    !!valid &&
    observed !== null &&
    now - received < GPS_FRESH_MS &&
    now - observed < GPS_FRESH_MS;
  const events = Array.isArray(s.events)
    ? s.events
        .filter((e) => time(e.at) !== null)
        .slice(-30)
        .map((e) => ({
          status: text(e.status, 80),
          leg: text(e.leg, 20),
          at: e.at,
        }))
    : [];
  const attention = [];
  if ([3, 5].includes(s.workflowVersion) && !validCustody)
    attention.push("Unexpected custody checkpoint");
  if (s.incidentOpen) attention.push("Open incident or dispute");
  if (["Created", "Shipment created"].includes(s.status))
    attention.push(
      s.payment?.status === "paid"
        ? "Paid but unassigned"
        : "Awaiting payment / assignment",
    );
  if (!fresh && ["pickup", "carrier", "lastmile"].includes(s.custodian))
    attention.push(valid ? "GPS stale" : "No authorized GPS fix");
  const lastEvent = time(events.at(-1)?.at || s.createdAt);
  if (lastEvent !== null && now - lastEvent >= stalledMs)
    attention.push("No recent delivery checkpoint");
  if (valid && observed === null)
    attention.push("GPS observation time unavailable");
  if (valid && location.accuracy > 200) attention.push("GPS accuracy is low");
  const stage = s.incidentOpen
    ? "incident"
    : s.custodian === "carrier"
      ? "carrier"
      : ["Out for delivery", "Delivery OTP sent"].includes(s.status)
        ? "lastmile"
        : s.custodian === "lastmile"
          ? "lastmile"
          : s.custodian === "pickup"
            ? "pickup"
            : s.actors?.pickup
              ? "assigned"
              : "waiting";
  return {
    id: s.id,
    code: text(s.code, 40),
    routeId: text(s.routeId, 40),
    routeName:
      text(s.pricingBreakdown?.routeName || s.routeName, 120) ||
      `${text(s.origin)} → ${text(s.destination)}`,
    origin: text(s.origin),
    originState: text(s.originState),
    destination: text(s.destination),
    destinationState: text(s.destinationState),
    deliveryType: ["interstate", "intrastate"].includes(s.deliveryType)
      ? s.deliveryType
      : "legacy",
    status: text(s.status, 80),
    custodian: text(s.custodian, 20) || "unknown",
    stage,
    holderKey: assigned?.id
      ? digest("live-map:" + s.custodian + ":" + assigned.id)
      : null,
    gps: {
      state: fresh ? "fresh" : valid ? "stale" : "unavailable",
      receivedAt: valid ? new Date(received).toISOString() : null,
      observedAt:
        valid && observed !== null ? new Date(observed).toISOString() : null,
      freshUntil:
        valid && observed !== null
          ? Math.min(received, observed) + GPS_FRESH_MS
          : null,
      position: valid
        ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy }
        : null,
    },
    attention,
    events,
  };
}
export function liveOperations(
  db,
  { env = {}, authorize, now = Date.now } = {},
) {
  const scopes = new Map();
  return async function route(req, url, send) {
    if (url.pathname !== "/api/admin/live-operations") return false;
    if (req.method !== "GET") {
      send(405, { error: "Read-only operations feed." });
      return true;
    }
    const auth = await authorize(req);
    if (!auth || !["super-admin", "operations"].includes(auth.role)) {
      send(403, { error: "Super-admin or operations permission is required." });
      return true;
    }
    const allowed =
        auth.shipmentIds === undefined ? null : new Set(auth.shipmentIds),
      scope = digest(
        JSON.stringify(
          allowed ? [...allowed].sort() : "all-authorized-operations",
        ),
      );
    const at = now(),
      sessions = new Map(
        (
          await db
            .prepare(
              "SELECT s.token_hash,s.rider_id,s.expires FROM rider_sessions s JOIN rider_profiles p ON p.id=s.rider_id WHERE s.expires>? AND p.suspended=0",
            )
            .all(at)
        ).map((s) => [s.token_hash, s]),
      ),
      suspended = new Set(
        (
          await db
            .prepare("SELECT id FROM rider_profiles WHERE suspended=1")
            .all()
        ).map((r) => r.id),
      );
    const records = [];
    for (const row of await db
      .prepare("SELECT id,payload FROM shipments")
      .all()) {
      if (allowed && !allowed.has(row.id)) continue;
      const s = JSON.parse(row.payload),
        record = operationsRecord(s, { now: at, sessions, suspended });
      if (record) records.push(record);
    }
    const byId = new Map(records.map((r) => [r.id, r]));
    if (
      (await db.prepare("PRAGMA table_info(notification_outbox)").all()).length
    ) {
      for (const row of await db
        .prepare(
          "SELECT shipment_id,state,created FROM notification_outbox WHERE state IN ('failed','pending','processing')",
        )
        .all()) {
        const r = byId.get(row.shipment_id);
        const reason =
          row.state === "failed"
            ? "Notification delivery failed"
            : at - row.created > 15 * 60000
              ? "Notification retry delayed"
              : null;
        if (r && reason && !r.attention.includes(reason))
          r.attention.push(reason);
      }
    }
    if (
      (await db.prepare("PRAGMA table_info(dispatch_handovers)").all()).length
    ) {
      for (const row of await db
        .prepare(
          "SELECT shipment_id,expires,created FROM dispatch_handovers WHERE state='pending'",
        )
        .all()) {
        const r = byId.get(row.shipment_id);
        const reason =
          row.expires <= at
            ? "Handover expired"
            : at - row.created > 10 * 60000
              ? "Handover awaiting acceptance"
              : null;
        if (r && reason && !r.attention.includes(reason))
          r.attention.push(reason);
      }
    }
    if ((await db.prepare("PRAGMA table_info(dispatch_jobs)").all()).length) {
      for (const row of await db
        .prepare(
          "SELECT shipment_id FROM dispatch_jobs WHERE state='needs-attention'",
        )
        .all()) {
        const r = byId.get(row.shipment_id);
        if (r) r.attention.push("Dispatch search exhausted");
      }
    }
    records.sort((a, b) => a.id.localeCompare(b.id));
    const hashes = new Map(
      records.map((r) => [r.id, digest(JSON.stringify(r))]),
    );
    const cursor = digest(scope + JSON.stringify([...hashes]));
    const history = scopes.get(scope) || [],
      previous = history.find(
        (s) => s.cursor === url.searchParams.get("cursor"),
      );
    const upserts = previous
        ? records.filter((r) => previous.hashes.get(r.id) !== hashes.get(r.id))
        : records,
      removed = previous
        ? [...previous.hashes.keys()].filter((id) => !hashes.has(id))
        : [];
    if (!history.some((s) => s.cursor === cursor))
      history.unshift({ cursor, hashes });
    scopes.delete(scope);
    scopes.set(scope, history.slice(0, 3));
    while (scopes.size > 16) scopes.delete(scopes.keys().next().value);
    send(200, {
      cursor,
      reset: !previous,
      upserts,
      removed,
      total: records.length,
      serverTime: new Date(at).toISOString(),
      freshnessMs: GPS_FRESH_MS,
      maps: publicMapConfig(env),
    });
    return true;
  };
}
