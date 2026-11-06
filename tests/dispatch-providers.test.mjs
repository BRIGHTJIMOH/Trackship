import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { dispatchNotificationProviders } from "../server/dispatch-notifications.mjs";
const encoded = (key) =>
  Buffer.from(key.export({ type: "pkcs8", format: "pem" })).toString("base64");
test("FCM adapter prepares scoped OAuth and private generic alerts; credentials stay out of payloads", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const calls = [];
  const adapter = dispatchNotificationProviders({
    env: {
      FCM_PROJECT_ID: "test-project",
      FCM_CLIENT_EMAIL: "test@example.invalid",
      FCM_PRIVATE_KEY_BASE64: encoded(privateKey),
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          access_token: "test-only-access",
          expires_in: 3600,
        }),
      };
    },
  });
  await adapter.fcm("device-token", "event-1", {
    title: "Delivery offer",
    body: "Open SendRack inbox.",
  });
  await adapter.fcm("device-token", "event-2", {
    title: "Delivery offer",
    body: "Open SendRack inbox.",
  });
  assert.equal(calls.length, 3);
  const claims = JSON.parse(
    Buffer.from(
      new URLSearchParams(calls[0].init.body).get("assertion").split(".")[1],
      "base64url",
    ),
  );
  assert.equal(
    claims.scope,
    "https://www.googleapis.com/auth/firebase.messaging",
  );
  const payload = JSON.parse(calls[1].init.body);
  assert.equal(payload.message.android.ttl, "120s");
  assert.deepEqual(payload.message.data, {
    eventId: "event-1",
    action: "open-delivery-inbox",
  });
  assert(!calls[1].init.body.includes("PRIVATE KEY"));
});
test("APNs adapter signs ES256, defaults to sandbox and rejects provider failure", async () => {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const calls = [];
  const env = {
    APNS_TEAM_ID: "TESTTEAM",
    APNS_KEY_ID: "TESTKEY",
    APNS_BUNDLE_ID: "example.sendrack.test",
    APNS_PRIVATE_KEY_BASE64: encoded(privateKey),
  };
  const adapter = dispatchNotificationProviders({
    env,
    apnsSend: async (input) => {
      calls.push(input);
      return { status: 200 };
    },
  });
  await adapter.apns("a".repeat(64), "event-1", {
    title: "Delivery offer",
    body: "Open inbox.",
  });
  assert.equal(calls[0].host, "https://api.sandbox.push.apple.com");
  assert.equal(calls[0].headers["apns-push-type"], "alert");
  assert.equal(
    Buffer.from(calls[0].headers.authorization.split(".")[2], "base64url")
      .length,
    64,
  );
  const unavailable = dispatchNotificationProviders({
    env,
    apnsSend: async () => ({ status: 410 }),
  });
  await assert.rejects(() => unavailable.apns("a".repeat(64), "event-2", {}), {
    status: 503,
  });
  await assert.rejects(
    () => dispatchNotificationProviders().fcm("t", "e", {}),
    { status: 503 },
  );
});
