import {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const fail = (message, status) => {
  throw Object.assign(new Error(message), { status });
};
export function totp(secret, counter) {
  if (!/^[A-Z2-7]{32,128}$/.test(secret || ""))
    fail("Owner authenticator setup is required.", 503);
  let bits = "";
  for (const c of secret)
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      .indexOf(c)
      .toString(2)
      .padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))),
    count = Buffer.alloc(8);
  count.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(count).digest(),
    o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
}
export async function dispatchStepup(db, { env, admin, now = Date.now }) {
  await db.exec(`CREATE TABLE IF NOT EXISTS dispatch_stepup(owner_hash TEXT PRIMARY KEY,token_hash TEXT,expires INTEGER,credential_tag TEXT);
 CREATE TABLE IF NOT EXISTS dispatch_mfa_counters(credential_tag TEXT PRIMARY KEY,counter INTEGER);
 CREATE TABLE IF NOT EXISTS dispatch_limits(scope TEXT PRIMARY KEY,used INTEGER,until_at INTEGER);`);
  const tag = () => hash(env.DISPATCH_OWNER_TOTP_SECRET || "");
  async function limit(scope, max, window = 60000) {
    const row = await db
        .prepare("SELECT * FROM dispatch_limits WHERE scope=?")
        .get(scope),
      at = now();
    if (row && row.until_at > at && row.used >= max)
      fail("Too many requests. Try later.", 429);
    await db
      .prepare(
        "INSERT INTO dispatch_limits VALUES (?,?,?) ON CONFLICT(scope) DO UPDATE SET used=excluded.used,until_at=excluded.until_at",
      )
      .run(
        scope,
        row && row.until_at > at ? row.used + 1 : 1,
        row && row.until_at > at ? row.until_at : at + window,
      );
  }
  async function unlock(req, code) {
    const session = await admin.authorize(req, { operator: false });
    await limit("mfa:" + session.actor, 5, 600000);
    const counter = Math.floor(now() / 30000),
      last = await db
        .prepare(
          "SELECT counter FROM dispatch_mfa_counters WHERE credential_tag=?",
        )
        .get(tag());
    const candidates = [counter - 1, counter, counter + 1];
    const accepted = candidates.find((n) => {
      if (
        n < 0 ||
        n <= (last?.counter ?? -1) ||
        typeof code !== "string" ||
        !/^\d{6}$/.test(code)
      )
        return false;
      return timingSafeEqual(
        Buffer.from(totp(env.DISPATCH_OWNER_TOTP_SECRET, n)),
        Buffer.from(code),
      );
    });
    if (accepted === undefined)
      fail("Invalid or already used authenticator code.", 401);
    const token = randomBytes(32).toString("hex"),
      expires = now() + 15 * 60000;
    await db
      .prepare(
        "INSERT INTO dispatch_mfa_counters VALUES (?,?) ON CONFLICT(credential_tag) DO UPDATE SET counter=excluded.counter",
      )
      .run(tag(), accepted);
    await db
      .prepare(
        "INSERT INTO dispatch_stepup VALUES (?,?,?,?) ON CONFLICT(owner_hash) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires,credential_tag=excluded.credential_tag",
      )
      .run(hash(session.token), hash(token), expires, tag());
    await admin.audit(session.actor, "dispatch.mfa", "session", "current");
    return { token, expires };
  }
  async function authorize(req, permission) {
    const session = await admin.authorize(req, { operator: false }),
      proof = req.headers["x-dispatch-mfa"];
    if (typeof proof !== "string" || !/^[a-f0-9]{64}$/.test(proof))
      fail("Unlock dispatch with your authenticator.", 403);
    const row = await db
      .prepare("SELECT * FROM dispatch_stepup WHERE owner_hash=?")
      .get(hash(session.token));
    if (
      !row ||
      row.expires <= now() ||
      row.token_hash !== hash(proof) ||
      row.credential_tag !== tag()
    )
      fail("Dispatch unlock expired. Authenticate again.", 403);
    return { id: session.actor, mfa: true, permissions: [permission] };
  }
  return { unlock, authorize, limit };
}
