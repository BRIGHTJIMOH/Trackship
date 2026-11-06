import { chromium } from "playwright-core";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { adminFixture } from "./admin-fixture.mjs";
const f = await adminFixture(),
  owner = await f.login(),
  db = f.server.database,
  samples = [];
const count = 2000,
  carrierCount = 60,
  start = performance.now(),
  now = Date.now();
try {
  await db.withRequest("POST", async () => {
    await db.exec("BEGIN IMMEDIATE");
    try {
      for (let i = 0; i < carrierCount; i++) {
        const id = "sample-carrier-" + i,
          session = createHash("sha256").update(id).digest("hex");
        await db
          .prepare(
            "INSERT INTO rider_profiles(id,phone,identity_status,suspended) VALUES (?,?,'approved',0)",
          )
          .run(id, "sample-phone-" + i);
        await db
          .prepare("INSERT INTO rider_sessions VALUES (?,?,?)")
          .run(session, id, now + 3600000);
      }
      for (let i = 0; i < count; i++) {
        const carrier = "sample-carrier-" + (i % carrierCount),
          session = createHash("sha256").update(carrier).digest("hex"),
          id = randomUUID(),
          stale = i % 11 === 0,
          receipt = new Date(now - (stale ? 180000 : 1000)).toISOString();
        const s = {
          id,
          code: "SR-SAMPLE-" + String(i).padStart(4, "0"),
          workflowVersion: 5,
          deliveryType: i % 3 === 0 ? "intrastate" : "interstate",
          origin: i % 2 ? "Zaria" : "Ikeja",
          originState: i % 2 ? "Kaduna" : "Lagos",
          destination: "Abuja",
          destinationState: "FCT Abuja",
          routeId: "sample-route-" + (i % 3),
          pricingBreakdown: { routeName: "Sample route " + (i % 3) },
          status: "In transit",
          custodian: "carrier",
          createdAt: new Date(now).toISOString(),
          actors: { carrier: { id: carrier } },
          locationConsent: {
            actor: carrier,
            leg: "carrier",
            sessionHash: session,
          },
          location: {
            lat: 6.5 + (i % carrierCount) * 0.045,
            lng: 3.4 + (i % carrierCount) * 0.045,
            accuracy: 15,
            at: receipt,
            receivedAt: receipt,
            leg: "carrier",
          },
          events: [
            {
              status: "Carrier received parcel",
              leg: "carrier",
              at: new Date(now - 60000).toISOString(),
            },
            {
              status: "In transit",
              leg: "carrier",
              at: new Date(now - 1000).toISOString(),
            },
          ],
          payment: { status: "paid", mode: "test", amount: 250000 },
        };
        if (s.deliveryType === "intrastate") {
          s.custodian = "pickup";
          s.status = "Out for delivery";
          s.actors.pickup = s.actors.carrier;
          s.location.leg = "pickup";
          s.locationConsent.leg = "pickup";
        }
        samples.push(s);
        await db
          .prepare(
            "INSERT INTO shipments(id,owner,public_hash,payload) VALUES (?,?,?,?)",
          )
          .run(id, "sample-owner", randomUUID(), JSON.stringify(s));
      }
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
  });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
    });
    await context.addCookies([
      {
        name: "sendrack_owner",
        value: owner.cookie.split("=")[1],
        url: f.base,
      },
    ]);
    await context.route("https://tile.openstreetmap.org/**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5gAAAABJRU5ErkJggg==",
          "base64",
        ),
      }),
    );
    // Test-only instrumentation of the real Leaflet instance; never included in application code.
    await context.route("**/assets/leaflet.js", (r) =>
      r.fulfill({
        status: 200,
        contentType: "text/javascript",
        body:
          readFileSync("web/assets/leaflet.js", "utf8") +
          "\nconst originalMap=L.map;L.map=(...args)=>{window.__testOperationsMap=originalMap(...args);return window.__testOperationsMap;};",
      }),
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let requests = 0,
      active = 0,
      maxConcurrent = 0,
      firstBytes = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/admin/live-operations")) {
        requests++;
        active++;
        maxConcurrent = Math.max(maxConcurrent, active);
      }
    });
    page.on("requestfinished", (req) => {
      if (req.url().includes("/api/admin/live-operations")) active--;
    });
    page.on("requestfailed", (req) => {
      if (req.url().includes("/api/admin/live-operations")) active--;
    });
    const started = performance.now();
    const first = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/live-operations") && r.status() === 200,
    );
    await page.goto(f.base + "/admin");
    const response = await first;
    firstBytes = (await response.body()).length;
    await page.waitForFunction(() =>
      document
        .querySelector(".map-count")
        ?.textContent.includes("2000 authorized"),
    );
    const firstRenderMs = performance.now() - started;
    assert((await page.locator(".operations-marker").count()) < 100);
    await page.locator(".operations-marker").first().click();
    await page.locator(".map-cluster-list").waitFor({ state: "visible" });
    assert(
      (await page.locator(".map-cluster-list [data-map-shipment]").count()) > 1,
    );
    await page.locator(".map-cluster-list [data-map-shipment]").first().click();
    assert(
      (await page.locator(".map-detail h3").innerText()).startsWith(
        "SR-SAMPLE-",
      ),
    );
    await page.evaluate(() => {
      window.__testOperationsMap.setView([7.2, 4.1], 9, { animate: false });
      window.__mapIdentity = window.__testOperationsMap;
      window.__mapElement = document.querySelector(".operations-map");
      window.__mapCenter=window.__testOperationsMap.getCenter();
    });
    await page.getByLabel("Map state", { exact: true }).selectOption("Kaduna");
    await page.getByLabel("Map shipment search").fill("SR-SAMPLE-0001");
    await page.locator(".map-active-section summary").click();
    await page.locator(".map-active-list [data-map-shipment]").first().click();
    await page
      .locator(".map-detail h3")
      .filter({ hasText: "SR-SAMPLE-0001" })
      .waitFor();
    await page.clock.install();
    for (let i = 0; i < 2; i++) {
      const next = page.waitForResponse(
        (r) =>
          r.url().includes("/api/admin/live-operations") && r.status() === 200,
      );
      await page.clock.fastForward(15000);
      await next;
    }
    assert.equal(
      await page.getByLabel("Map state", { exact: true }).inputValue(),
      "Kaduna",
    );
    assert.equal(
      await page.getByLabel("Map shipment search").inputValue(),
      "SR-SAMPLE-0001",
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.__testOperationsMap === window.__mapIdentity &&
          document.querySelector(".operations-map") === window.__mapElement,
      ),
      true,
    );
    assert.equal(
      await page.evaluate(() => window.__testOperationsMap.getZoom()),
      9,
    );
    assert.equal(
      await page.locator(".map-detail h3").innerText(),
      "SR-SAMPLE-0001",
    );
    assert.equal(await page.evaluate(()=>window.__testOperationsMap.getCenter().equals(window.__mapCenter)),true);
  // Transient failures preserve zoom, filter draft, selection; local freshness still expires.
    await context.route("**/api/admin/live-operations*", (r) =>
      r.abort("failed"),
    );
    await page.getByRole("button", { name: "Reconnect / refresh" }).click();
    await page.locator(".map-connection.offline").waitFor();
    await page.clock.fastForward(130000);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".operations-marker:not(.stale)").length ===
        0,
    );
    assert.equal(
      await page.getByLabel("Map shipment search").inputValue(),
      "SR-SAMPLE-0001",
    );
    await page.getByLabel('Show last known positions (grey)',{exact:true}).check();
  await page.getByRole('button',{name:'Locate recorded fix'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.operations-marker.stale').length>0);
  await page.evaluate(()=>window.__beforeReconnectCenter=window.__testOperationsMap.getCenter());
  await context.unroute("**/api/admin/live-operations*");
    await page.getByRole("button", { name: "Reconnect / refresh" }).click();
    await page.waitForFunction(() =>
      document
        .querySelector(".map-connection")
        .textContent.startsWith("Connected"),
    );
    assert.equal(
      await page.evaluate(() => window.__testOperationsMap.getZoom()),
      9,
    );
    assert.equal(await page.evaluate(()=>window.__testOperationsMap.getCenter().equals(window.__beforeReconnectCenter)),true);
  // A real server-record handover invalidates the previous holder's position; delivery removes it.
    const selected = samples[1];
    selected.custodian = "lastmile";
    selected.status = "Last-mile rider received parcel";
    selected.actors.lastmile = { id: "new-holder" };
    await db
      .prepare("UPDATE shipments SET payload=? WHERE id=?")
      .run(JSON.stringify(selected), selected.id);
    await page.getByRole("button", { name: "Reconnect / refresh" }).click();
    await page.waitForFunction(() =>
      document
        .querySelector(".map-detail")
        .textContent.includes("No authorized current-holder GPS"),
    );
    assert.equal(await page.locator(".operations-marker").count(), 0);
    selected.status = "Delivered";
    await db
      .prepare("UPDATE shipments SET payload=? WHERE id=?")
      .run(JSON.stringify(selected), selected.id);
    await page.getByRole("button", { name: "Reconnect / refresh" }).click();
    await page.getByRole("heading", { name: "Live tracking ended" }).waitFor();
    await page.getByLabel("Map state", { exact: true }).selectOption("");
    await page.getByLabel("Map shipment search").fill("");
    await page.evaluate(() =>
      window.__testOperationsMap.setView([8.1, 5.8], 6, { animate: false }),
    );
    await page.getByLabel('Show last known positions (grey)',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByLabel('Map shipment search').fill('SR-SAMPLE-0002');
  await page.locator('.map-active-list [data-map-shipment]').first().click();
  await page.getByLabel('Map shipment search').fill('');
  const dir = "docs/live-map";
    mkdirSync(dir, { recursive: true });
    for (const [width, height, name] of [
      [1366, 768, "overview-1366"],
      [1920, 1080, "overview-1920"],
      [390, 844, "overview-mobile"],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
    }
    assert(maxConcurrent <= 1);
    assert.deepEqual(errors, []);
    const result = {
      activeSampleShipments: count,
      carrierCount,
      fixtureSeedMs: Math.round(started - start),
      initialFeedBytes: firstBytes,
      initialFeedAndMapMs: Math.round(firstRenderMs),
      maxConcurrentFeedRequests: maxConcurrent,
      feedRequests: requests,
      renderedMarkers: await page.locator(".operations-marker").count(),
      browser: "Chromium desktop/mobile emulation",
      tiles: "Mock PNG tiles; no provider billing",
      gps: "Static sample server records, not devices or simulated production movement",
    };
    writeFileSync(
      `${dir}/performance.json`,
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
  }
} finally {
  await f.close();
}
