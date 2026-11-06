import { createApp } from "../server/server.mjs";
import { setTimeout as delay } from "node:timers/promises";
const server = await createApp(),
  controller = new AbortController();
if (!server.dispatchEnabled) {
  await server.database.close();
  throw new Error(
    "Dispatch preview is disabled. This worker cannot activate production dispatch.",
  );
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => controller.abort());
try {
  do {
    await server.runDispatchTick();
    if (process.argv.includes("--once") || controller.signal.aborted) break;
    try {
      await delay(30000, null, { signal: controller.signal });
    } catch (e) {
      if (e.name !== "AbortError") throw e;
    }
  } while (!controller.signal.aborted);
} finally {
  await server.database.close();
}
