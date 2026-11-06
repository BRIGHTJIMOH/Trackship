import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { adminFixture, vendorProfile, riderProfile } from "./admin-fixture.mjs";
import { totp } from "../server/dispatch-stepup.mjs";
import { dispatchHttp } from "../server/dispatch-http.mjs";
import { dispatchFixture, secret } from "./dispatch-fixture.mjs";
test("v5 HTTP: opt-in preview is disabled by default and cannot activate on production", async () => {
  const f = await adminFixture();
  try {
    assert.equal(
      (await (await f.api("/api/v5/capabilities")).json()).enabled,
      false,
    );
    assert.equal((await f.api("/api/v5/shipments")).status, 503);
  } finally {
    await f.close();
  }
  const p = await dispatchHttp(null, {
    env: { NODE_ENV: "production", SENDRACK_DISPATCH_PREVIEW: "true" },
  });
  assert.equal(p.enabled, false);
});
test("v5 HTTP: canonical prices, atomic idempotent creation, owner isolation and legacy mutation guards", async (t) => {
  const f = await dispatchFixture(t);
  assert.equal(
    (await f.api("/api/v5/shipments", f.payload(), { token: f.r.token }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.api(
        "/api/v5/shipments",
        { ...f.payload(), totalKobo: 1 },
        { token: f.v.token },
      )
    ).status,
    409,
  );
  const p = f.payload(),
    s = await f.create(p),
    retry = await f.create(p);
  assert.equal(retry.id, s.id);
  assert.equal(s.workflowVersion, 5);
  assert.equal(s.payment.amount, f.quote.totalKobo);
  assert.equal(s.fees.pickup, 200000);
  assert.equal(s.pricingBreakdown.platformKobo, 15000);
  assert.equal(s.custodian, "vendor");
  assert.equal(
    (await f.api("/api/v5/shipments/" + s.id, undefined, { token: f.r.token }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.api("/api/shipments/" + s.id, s, {
        token: f.v.token,
        method: "PUT",
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.server.database.prepare("SELECT * FROM dispatch_jobs").all())
      .length,
    1,
  );
  const before = (
    await f.server.database.prepare("SELECT COUNT(*) AS n FROM shipments").get()
  ).n;
  await assert.rejects(() =>
    f.create({ ...f.payload(), pickupCoordinates: { lat: 999 } }),
  );
  assert.equal(
    (
      await f.server.database
        .prepare("SELECT COUNT(*) AS n FROM shipments")
        .get()
    ).n,
    before,
    "failed initialization cannot leave a partial legacy shipment",
  );
  const tracking = await (await f.api("/api/track/" + s.publicToken)).json();
  assert.equal(tracking.workflowVersion, 5);
  assert.equal(tracking.phone, undefined);
  assert.equal(tracking.address, undefined);
  const page = await f.api("/t/" + s.publicToken);
  assert((await page.text()).includes("/dispatch.js"));
  for (const path of [
    "/",
    "/app",
    "/admin",
    "/app/dispatch",
    "/admin/dispatch",
    "/dispatch.js",
    "/dispatch.css",
  ])
    assert.equal((await f.api(path)).status, 200, path);
});
test("v5 HTTP: provider-confirmed funding, physical pickup, private customer proof and atomic completion", async (t) => {
  const f = await dispatchFixture(t),
    s = await f.create(),
    post = (path, p, token = f.r.token) =>
      f.api("/api/v5/" + path, { requestId: randomUUID(), ...p }, { token });
  const grant = await (
    await post("location/consent", { consent: true })
  ).json();
  assert.equal(
    (
      await post("location", {
        consentNonce: grant.nonce,
        lat: 11.085,
        lng: 7.72,
        accuracy: 10,
        observedAt: Date.now(),
        consent: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await (
        await f.api("/api/v5/offers", undefined, { token: f.r.token })
      ).json()
    ).offers.length,
    0,
  );
  const checkout = await f.api(
    "/api/v3/shipments/" + s.id + "/pay",
    { email: "vendor@example.invalid" },
    { token: f.v.token },
  );
  assert.equal(checkout.status, 200);
  assert.equal(
    (
      await f.api(
        "/api/v3/shipments/" + s.id + "/verify-payment",
        {},
        { token: f.v.token },
      )
    ).status,
    200,
  );
  const offers = (
    await (
      await f.api("/api/v5/offers", undefined, { token: f.r.token })
    ).json()
  ).offers;
  assert.equal(offers.length, 1);
  assert(!JSON.stringify(offers).includes("Private"));
  assert.equal(
    (await post("offers/" + offers[0].offerId + "/accept", {})).status,
    200,
  );
  for (const action of ["travel", "arrive"])
    assert.equal(
      (await post("shipments/" + s.id + "/progress", { action })).status,
      200,
    );
  const transfer = await post(
    "shipments/" + s.id + "/handover",
    { toId: f.r.profile.id },
    f.v.token,
  );
  assert.equal(transfer.status, 200);
  const h = await transfer.json();
  assert.equal(
    (await post("handovers/" + h.handoverId + "/accept", {})).status,
    200,
  );
  assert.equal(
    (await post("shipments/" + s.id + "/progress", { action: "depart-final" }))
      .status,
    200,
  );
  assert.equal(
    (
      await f.api("/api/v5/customer/" + s.publicToken, {
        action: "request-contact-code",
      })
    ).status,
    200,
  );
  await f.server.runDispatchTick();
  const contact = f.texts
    .findLast((m) => m.message.includes("Verify the contact"))
    .message.match(/\b\d{6}\b/)[0];
  assert.equal(
    (
      await f.api("/api/v5/customer/" + s.publicToken, {
        action: "verify-contact",
        code: contact,
      })
    ).status,
    200,
  );
  await f.server.runDispatchTick();
  const delivery = f.texts
    .findLast((m) => m.message.includes("delivery code"))
    .message.match(/\b\d{6}\b/)[0];
  assert.equal(
    (await post("shipments/" + s.id + "/complete", { code: delivery })).status,
    200,
  );
  assert.equal(
    (
      await f.server.database
        .prepare("SELECT * FROM earnings WHERE shipment_id=?")
        .all(s.id)
    ).length,
    1,
  );
});
test("v5 HTTP: owner authenticator step-up rejects machine tokens/replay and protects mutations", async (t) => {
  const f = await dispatchFixture(t),
    s = await f.create();
  assert.equal(
    (
      await f.api("/api/v5/admin/operations", undefined, {
        token: f.env.TRACKSHIP_ADMIN_TOKEN,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.api("/api/v5/admin/operations", undefined, {
        cookie: f.owner.cookie,
      })
    ).status,
    403,
  );
  const unlocked = await f.stepup();
  assert.equal(
    (await f.api("/api/v5/admin/operations", undefined, unlocked)).status,
    200,
  );
  assert.equal(
    (
      await f.api(
        "/api/v5/admin/unlock",
        { code: totp(secret, Math.floor(Date.now() / 30000)) },
        { cookie: f.owner.cookie, csrf: f.owner.csrf },
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await f.api(
        "/api/v5/admin/shipments/" + s.id,
        { action: "cancel" },
        { ...unlocked, csrf: undefined },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.api(
        "/api/v5/admin/shipments/" + s.id,
        { action: "cancel" },
        unlocked,
      )
    ).status,
    200,
  );
  assert.equal((await f.api("/api/track/" + s.publicToken)).status, 404);
});

test("v5 HTTP: withdrawn consent rejects delayed fixes and installation tokens remain scoped/encrypted", async (t) => {
  const f = await dispatchFixture(t),
    auth = { token: f.r.token };
  const grant = await (
      await f.api("/api/v5/location/consent", { consent: true }, auth)
    ).json(),
    fix = {
      lat: 11.085,
      lng: 7.72,
      accuracy: 10,
      observedAt: Date.now(),
      consent: true,
      consentNonce: grant.nonce,
    };
  assert.equal((await f.api("/api/v5/location", fix, auth)).status, 200);
  assert.equal(
    (await f.api("/api/v5/location", { stop: true }, auth)).status,
    200,
  );
  assert.equal((await f.api("/api/v5/location", fix, auth)).status, 403);
  assert.equal(
    (await f.server.database.prepare("SELECT * FROM dispatch_positions").all())
      .length,
    0,
  );
  const id = randomUUID(),
    device = "test-native-token-".repeat(5);
  assert.equal(
    (
      await f.api(
        "/api/v5/installations",
        { installationId: id, platform: "android", token: device },
        auth,
      )
    ).status,
    200,
  );
  const row = await f.server.database
    .prepare("SELECT * FROM dispatch_installations WHERE id=?")
    .get(id);
  assert(!row.token_cipher.includes(device));
  assert.equal(
    (
      await f.api(
        "/api/v5/installations",
        { installationId: id, platform: "android", token: device },
        { token: f.v.token },
      )
    ).status,
    403,
  );
  await f.server.database
    .prepare("UPDATE rider_profiles SET identity_status='submitted' WHERE id=?")
    .run(f.r.profile.id);
  assert.equal((await f.api("/api/auth/logout", {}, auth)).status, 200);
  assert.equal(
    (
      await f.server.database
        .prepare("SELECT * FROM dispatch_installations WHERE id=?")
        .get(id)
    ).revoked,
    1,
  );
  assert.equal((await f.api("/api/v5/inbox", undefined, auth)).status, 401);
});

test("owner TOTP matches the published SHA1 test vector", () => {
  assert.equal(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1), "287082");
});
