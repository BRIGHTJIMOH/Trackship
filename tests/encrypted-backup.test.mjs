import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  encryptBackup,
  decryptBackup,
  backupSqlite,
} from "../server/encrypted-backup.mjs";
test("encrypted SQLite backup restores committed WAL, account/shipment/ledger data and refuses overwrite", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "sendrack-restore-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, "live.sqlite"),
    archive = path.join(directory, "backup.enc"),
    target = path.join(directory, "restored.sqlite"),
    key = randomBytes(32).toString("hex");
  const live = new DatabaseSync(source);
  t.after(() => live.close());
  live.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE records(kind TEXT PRIMARY KEY,payload TEXT); INSERT INTO records VALUES ('account','private-account'),('shipment','custody-history'),('ledger','provider-pending');",
  );
  await backupSqlite(source, archive, key);
  assert.equal(statSync(archive).mode & 0o777, 0o600);
  assert(!readFileSync(archive).includes(Buffer.from("private-account")));
  await decryptBackup(archive, target, key);
  const restored = new DatabaseSync(target);
  try {
    assert.equal(
      restored.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    assert.deepEqual(
      restored.prepare("SELECT * FROM records ORDER BY kind").all(),
      live.prepare("SELECT * FROM records ORDER BY kind").all(),
    );
  } finally {
    restored.close();
  }
  await assert.rejects(() => decryptBackup(archive, target, key));
});
test("backup rejects wrong keys, tampering and missing keys without publishing partial plaintext", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "sendrack-backup-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source"),
    archive = path.join(directory, "backup.enc"),
    target = path.join(directory, "restored"),
    key = randomBytes(32).toString("hex");
  writeFileSync(source, "PRIVATE DOCUMENT", { mode: 0o600 });
  await encryptBackup(source, archive, key);
  await assert.rejects(() => decryptBackup(archive, target, "a".repeat(64)));
  assert.equal(existsSync(target), false);
  const bytes = readFileSync(archive);
  bytes[25] ^= 1;
  writeFileSync(archive, bytes);
  await assert.rejects(() => decryptBackup(archive, target, key));
  assert.equal(existsSync(target), false);
  await assert.rejects(() => encryptBackup(source, archive, ""));
});
