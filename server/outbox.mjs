import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
export function encryptedPayload(keyHex) {
  const key = () => {
    if (!/^[a-f0-9]{64}$/i.test(keyHex || ""))
      throw Object.assign(
        new Error(
          "A separate 32-byte notification encryption key is required.",
        ),
        { status: 503 },
      );
    return Buffer.from(keyHex, "hex");
  };
  return {
    seal(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key(), iv),
        data = Buffer.concat([
          cipher.update(JSON.stringify(value)),
          cipher.final(),
        ]);
      return JSON.stringify({
        iv: iv.toString("hex"),
        tag: cipher.getAuthTag().toString("hex"),
        data: data.toString("hex"),
      });
    },
    open(value) {
      const p = JSON.parse(value),
        cipher = createDecipheriv(
          "aes-256-gcm",
          key(),
          Buffer.from(p.iv, "hex"),
        );
      cipher.setAuthTag(Buffer.from(p.tag, "hex"));
      return JSON.parse(
        Buffer.concat([
          cipher.update(Buffer.from(p.data, "hex")),
          cipher.final(),
        ]).toString(),
      );
    },
  };
}
export async function notificationOutbox(
  db,
  {
    key,
    deliver,
    validate = async () => true,
    accepted = async () => {},
    now = Date.now,
  },
) {
  await db.exec(`CREATE TABLE IF NOT EXISTS notification_outbox(id TEXT PRIMARY KEY,dedupe TEXT UNIQUE,kind TEXT,shipment_id TEXT,recipient_id TEXT,payload_cipher TEXT,state TEXT DEFAULT 'pending',attempts INTEGER DEFAULT 0,available_at INTEGER,lease_until INTEGER DEFAULT 0,lease_token TEXT,created INTEGER,updated INTEGER,last_error TEXT);
 CREATE INDEX IF NOT EXISTS notification_due ON notification_outbox(state,available_at);`);
  const crypto = encryptedPayload(key);
  async function enqueue({
    dedupe,
    kind,
    shipmentId = null,
    recipientId = null,
    payload,
  }) {
    const id = randomUUID(),
      at = now();
    await db
      .prepare(
        "INSERT OR IGNORE INTO notification_outbox(id,dedupe,kind,shipment_id,recipient_id,payload_cipher,state,attempts,available_at,lease_until,created,updated) VALUES (?,?,?,?,?,?,?,0,?,0,?,?)",
      )
      .run(
        id,
        dedupe,
        kind,
        shipmentId,
        recipientId,
        crypto.seal(payload),
        "pending",
        at,
        at,
        at,
      );
    return id;
  }
  async function tick(limit = 10) {
    let processed = 0;
    for (let i = 0; i < Math.min(limit, 50); i++) {
      const row = await db.withRequest("POST", async () => {
        const at = now(),
          item = await db
            .prepare(
              "SELECT * FROM notification_outbox WHERE (state='pending' AND available_at<=?) OR (state='processing' AND lease_until<?) ORDER BY created,id LIMIT 1",
            )
            .get(at, at);
        if (!item) return null;
        const lease = randomUUID();
        await db
          .prepare(
            "UPDATE notification_outbox SET state='processing',attempts=attempts+1,lease_until=?,lease_token=?,updated=? WHERE id=?",
          )
          .run(at + 60000, lease, at, item.id);
        return { ...item, lease_token: lease, attempts: item.attempts + 1 };
      });
      if (!row) break;
      try {
        const payload = crypto.open(row.payload_cipher);
        if (!(await db.withRequest("POST", () => validate(row, payload)))) {
          await db.withRequest("POST", () =>
            db
              .prepare(
                "UPDATE notification_outbox SET state='obsolete',payload_cipher='',updated=? WHERE id=? AND lease_token=?",
              )
              .run(now(), row.id, row.lease_token),
          );
          processed++;
          continue;
        }
        await deliver(row, payload);
        await db.withRequest("POST", async () => {
          await db.exec("BEGIN IMMEDIATE");
          try {
            const owns = await db
              .prepare(
                "SELECT id FROM notification_outbox WHERE id=? AND lease_token=? AND state='processing'",
              )
              .get(row.id, row.lease_token);
            if (!owns) {
              await db.exec("ROLLBACK");
              return;
            }
            if (await validate(row, payload)) await accepted(row, payload);
            await db
              .prepare(
                "UPDATE notification_outbox SET state='sent',payload_cipher='',lease_until=0,last_error=NULL,updated=? WHERE id=? AND lease_token=?",
              )
              .run(now(), row.id, row.lease_token);
            await db.exec("COMMIT");
          } catch (e) {
            await db.exec("ROLLBACK");
            throw e;
          }
        });
      } catch {
        await db.withRequest("POST", () =>
          db
            .prepare(
              "UPDATE notification_outbox SET state=?,available_at=?,lease_until=0,last_error=?,updated=? WHERE id=? AND lease_token=?",
            )
            .run(
              row.attempts >= 20 ? "failed" : "pending",
              now() +
                Math.min(1800000, 30000 * 2 ** Math.min(row.attempts - 1, 6)),
              "Provider delivery unavailable; inspect provider configuration and retry status.",
              now(),
              row.id,
              row.lease_token,
            ),
        );
      }
      processed++;
    }
    return { processed };
  }
  return { enqueue, tick, crypto };
}
