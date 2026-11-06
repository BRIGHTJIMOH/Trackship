import { createSign } from "node:crypto";
import { connect } from "node:http2";
const unavailable = (message) =>
  Object.assign(new Error(message), { status: 503 });
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (header, claims, key, encoding) => {
  const input = b64(header) + "." + b64(claims),
    sign = createSign(header.alg === "RS256" ? "RSA-SHA256" : "SHA256");
  sign.update(input);
  return (
    input +
    "." +
    sign
      .sign({ key, ...(encoding ? { dsaEncoding: encoding } : {}) })
      .toString("base64url")
  );
};
function pem(raw) {
  return Buffer.from(raw || "", "base64").toString();
}
// APNs token authentication, with a bounded connection lifetime; no payload/credential logging.
export async function sendApns({ host, path, headers, payload }) {
  return new Promise((resolve, reject) => {
    const client = connect(host);
    let ended = false;
    const finish = (error, value) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      client.destroy();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(
      () => finish(unavailable("APNs timed out.")),
      10000,
    );
    client.on("error", () =>
      finish(unavailable("APNs connection unavailable.")),
    );
    const stream = client.request({
      ":method": "POST",
      ":path": path,
      ...headers,
    });
    let status;
    stream.on("response", (h) => {
      status = h[":status"];
    });
    stream.on("data", () => {});
    stream.on("error", () => finish(unavailable("APNs request unavailable.")));
    stream.on("end", () => finish(null, { status }));
    stream.end(JSON.stringify(payload));
  });
}
export function dispatchNotificationProviders({
  env = {},
  fetchImpl = fetch,
  apnsSend = sendApns,
  now = Date.now,
} = {}) {
  let access = null,
    apple = null;
  const project = env.FCM_PROJECT_ID,
    clientEmail = env.FCM_CLIENT_EMAIL,
    privateKey = pem(env.FCM_PRIVATE_KEY_BASE64);
  const fcmReady = Boolean(project && clientEmail && privateKey),
    apnsReady = Boolean(
      env.APNS_TEAM_ID &&
        env.APNS_KEY_ID &&
        env.APNS_BUNDLE_ID &&
        env.APNS_PRIVATE_KEY_BASE64,
    );
  async function oauth() {
    if (access && access.expires > now() + 60000) return access.token;
    const issued = Math.floor(now() / 1000),
      assertion = jwt(
        { alg: "RS256", typ: "JWT" },
        {
          iss: clientEmail,
          scope: "https://www.googleapis.com/auth/firebase.messaging",
          aud: "https://oauth2.googleapis.com/token",
          iat: issued,
          exp: issued + 3600,
        },
        privateKey,
      );
    const response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw unavailable("FCM service-account authentication failed.");
    const data = await response.json();
    if (
      typeof data.access_token !== "string" ||
      !Number.isFinite(data.expires_in)
    )
      throw unavailable("FCM service-account response invalid.");
    access = {
      token: data.access_token,
      expires: now() + data.expires_in * 1000,
    };
    return access.token;
  }
  async function fcm(token, eventId, { title, body }) {
    if (!fcmReady) throw unavailable("FCM is not configured.");
    const auth = await oauth();
    const response = await fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: { eventId, action: "open-delivery-inbox" },
            android: {
              priority: "high",
              ttl: "120s",
              notification: { channel_id: "sendrack_deliveries", tag: eventId },
            },
          },
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw unavailable("FCM notification unavailable.");
    return { accepted: true };
  }
  async function apns(token, eventId, { title, body }) {
    if (!apnsReady) throw unavailable("APNs is not configured.");
    if (!apple || now() - apple.at > 3000000) {
      apple = {
        at: now(),
        token: jwt(
          { alg: "ES256", kid: env.APNS_KEY_ID },
          { iss: env.APNS_TEAM_ID, iat: Math.floor(now() / 1000) },
          pem(env.APNS_PRIVATE_KEY_BASE64),
          "ieee-p1363",
        ),
      };
    }
    if (!/^[a-f0-9]{64}$/i.test(token))
      throw unavailable("APNs installation token invalid.");
    const response = await apnsSend({
      host:
        env.APNS_ENVIRONMENT === "production"
          ? "https://api.push.apple.com"
          : "https://api.sandbox.push.apple.com",
      path: "/3/device/" + token,
      headers: {
        authorization: "bearer " + apple.token,
        "apns-topic": env.APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(now() / 1000) + 120),
        "apns-collapse-id": eventId,
      },
      payload: {
        aps: { alert: { title, body }, sound: "default" },
        eventId,
        action: "open-delivery-inbox",
      },
    });
    if (response.status !== 200)
      throw unavailable("APNs notification unavailable.");
    return { accepted: true };
  }
  return { fcmReady, apnsReady, fcm, apns };
}
