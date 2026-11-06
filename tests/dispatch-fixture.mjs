import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { adminFixture, vendorProfile, riderProfile } from "./admin-fixture.mjs";
import { totp } from "../server/dispatch-stepup.mjs";
export const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
export async function dispatchFixture(t) {
  const f = await adminFixture({
    envOverrides: {
      SENDRACK_DISPATCH_PREVIEW: "true",
      NOTIFICATION_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      DISPATCH_OWNER_TOTP_SECRET: secret,
    },
  });
  if (t) t.after(() => f.close());
  const owner = await f.login();
  const v = await f.account("vendor", vendorProfile),
    r = await f.account("rider", riderProfile);
  await f.identity("vendor", v);
  await f.identity("rider", r);
  const db = f.server.database;
  await db
    .prepare("UPDATE vendor_accounts SET identity_status='approved' WHERE id=?")
    .run(v.profile.id);
  await db
    .prepare("UPDATE rider_profiles SET identity_status='approved' WHERE id=?")
    .run(r.profile.id);
  const routeResult = await f.api(
    "/api/admin/routes",
    {
      name: "Sample Kaduna local",
      origin: "Zaria",
      originState: "Kaduna",
      destination: "Kaduna",
      destinationState: "Kaduna",
      deliveryType: "intrastate",
      pickupFee: "2000",
      platformPercent: 5,
      platformFlatFee: 50,
    },
    { cookie: owner.cookie, csrf: owner.csrf },
  );
  assert.equal(routeResult.status, 201);
  const route = await routeResult.json();
  const quote = await (
    await f.api("/api/routes/" + route.id + "/quote", {
      origin: route.origin,
      originState: route.originState,
      destination: route.destination,
      destinationState: route.destinationState,
      deliveryType: route.deliveryType,
    })
  ).json();
  const payload = () => ({
    requestId: randomUUID(),
    routeId: route.id,
    routeRevision: quote.routeRevision,
    pricingRevision: quote.pricingRevision,
    totalKobo: quote.totalKobo,
    recipient: "Sample Recipient",
    phone: "08011112222",
    description: "Small clothing parcel",
    address: "10 Private Destination Street",
    requiredVehicle: "bicycle",
    pickupCoordinates: {
      lat: 11.085,
      lng: 7.72,
      accuracy: 10,
      observedAt: Date.now(),
      consent: true,
    },
  });
  return {
    ...f,
    owner,
    v,
    r,
    route,
    quote,
    payload,
    async create(p = payload()) {
      const response = await f.api("/api/v5/shipments", p, { token: v.token });
      assert.equal(response.status, 201, await response.clone().text());
      return response.json();
    },
    async stepup() {
      const response = await f.api(
        "/api/v5/admin/unlock",
        { code: totp(secret, Math.floor(Date.now() / 30000)) },
        { cookie: owner.cookie, csrf: owner.csrf },
      );
      assert.equal(response.status, 200, await response.clone().text());
      const { token } = await response.json();
      return {
        cookie: owner.cookie,
        csrf: owner.csrf,
        headers: { "X-Dispatch-MFA": token },
      };
    },
  };
}
