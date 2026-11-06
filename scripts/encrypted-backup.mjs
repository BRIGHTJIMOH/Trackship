import {
  encryptBackup,
  decryptBackup,
  backupSqlite,
} from "../server/encrypted-backup.mjs";
const [action, source, target] = process.argv.slice(2);
try {
  if (
    !source ||
    !target ||
    !["seal", "restore-file", "sqlite"].includes(action)
  )
    throw new Error(
      "Usage: node scripts/encrypted-backup.mjs <seal|restore-file|sqlite> SOURCE NEW_TARGET",
    );
  const run = {
    seal: encryptBackup,
    "restore-file": decryptBackup,
    sqlite: backupSqlite,
  }[action];
  await run(source, target, process.env.BACKUP_ENCRYPTION_KEY);
  console.log(
    "Completed. Store the encryption key separately and test restoration in an isolated environment.",
  );
} catch {
  console.error(
    "Backup operation failed. Check paths, key configuration and available disk space; existing target files are never replaced.",
  );
  process.exitCode = 1;
}
