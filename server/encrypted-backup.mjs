import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, unlink, link, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { DatabaseSync, backup } from "node:sqlite";
const MAGIC = Buffer.from("SRBK01");
const key = (value) => {
  if (!/^[a-f0-9]{64}$/i.test(value || ""))
    throw new Error(
      "BACKUP_ENCRYPTION_KEY must be a separate 32-byte hex key.",
    );
  return Buffer.from(value, "hex");
};
async function publish(temp, target) {
  await link(temp, target);
  await unlink(temp);
}
// Publish only a fully written/verified archive. Never replace an existing target.
export async function encryptBackup(source, target, keyHex) {
  const secret = key(keyHex),
    temp = target + "." + randomBytes(12).toString("hex") + ".partial";
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", secret, iv);
  cipher.setAAD(MAGIC);
  try {
    const handle = await open(temp, "wx", 0o600);
    await handle.write(Buffer.concat([MAGIC, iv]));
    await handle.close();
    await pipeline(
      createReadStream(source),
      cipher,
      createWriteStream(temp, { flags: "a", mode: 0o600 }),
    );
    const out = await open(temp, "a");
    await out.write(cipher.getAuthTag());
    await out.sync();
    await out.close();
    await publish(temp, target);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export async function decryptBackup(source, target, keyHex) {
  const secret = key(keyHex),
    size = (await stat(source)).size;
  if (size < MAGIC.length + 12 + 16)
    throw new Error("Invalid encrypted backup.");
  const input = await open(source, "r"),
    header = Buffer.alloc(MAGIC.length + 12),
    tag = Buffer.alloc(16);
  try {
    await input.read(header, 0, header.length, 0);
    await input.read(tag, 0, 16, size - 16);
  } finally {
    await input.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error("Unsupported encrypted backup.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secret,
    header.subarray(MAGIC.length),
  );
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  const temp = target + "." + randomBytes(12).toString("hex") + ".partial";
  try {
    await pipeline(
      createReadStream(source, { start: header.length, end: size - 17 }),
      decipher,
      createWriteStream(temp, { flags: "wx", mode: 0o600 }),
    );
    await publish(temp, target);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export async function backupSqlite(source, target, keyHex) {
  key(keyHex);
  const snapshot =
    target + "." + randomBytes(12).toString("hex") + ".sqlite-snapshot";
  // SQLite online backup includes committed WAL state; do not copy only the live .sqlite file.
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    const handle = await open(snapshot, "wx", 0o600);
    await handle.close();
    await backup(db, snapshot);
    await encryptBackup(snapshot, target, keyHex);
  } finally {
    db.close();
    await unlink(snapshot).catch(() => {});
  }
}
