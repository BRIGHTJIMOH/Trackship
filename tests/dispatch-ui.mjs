import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dispatchFixture, secret } from "./dispatch-fixture.mjs";
import { totp } from "../server/dispatch-stepup.mjs";
const f = await dispatchFixture(),
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
const shots = "docs/dispatch/screenshots";
mkdirSync(shots, { recursive: true });
const errors = [];
try {
  const shipment = await f.create();
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  await context.addInitScript(
    (token) => sessionStorage.setItem("sendrack-dispatch-session", token),
    f.v.token,
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(f.base + "/app/dispatch");
  await page.getByRole("button", { name: "Open delivery" }).click();
  await page
    .getByLabel("Package requirements")
    .fill("Unsaved sample parcel requirements");
  await page.getByLabel("Recipient name").fill("Unsaved sample recipient");
  await page.locator('[name="toId"]').evaluate((el) => {
    el.value = "unsaved-handler-reference";
  });
  await page.getByText("Report a parcel problem").click();
  await page.getByLabel("Package requirements").focus();
  await page.evaluate(() => window.scrollTo(0, 150));
  const before = await page.evaluate(() => ({
    scroll: scrollY,
    focus: document.activeElement.name,
  }));
  for (let i = 0; i < 2; i++) {
    const response = page.waitForResponse(
      (r) => r.url() === f.base + "/api/v5/handovers" && r.status() === 200,
    );
    await page.clock.fastForward(15000);
    await response;
    await page.waitForTimeout(100);
  }
  assert.equal(
    await page.getByLabel("Package requirements").inputValue(),
    "Unsaved sample parcel requirements",
  );
  assert.equal(
    await page.locator('[name="toId"]').inputValue(),
    "unsaved-handler-reference",
  );
  assert.equal(await page.locator("details").getAttribute("open"), "");
  assert.equal(
    await page.evaluate(() => document.activeElement.name),
    before.focus,
  );
  assert(Math.abs((await page.evaluate(() => scrollY)) - before.scroll) < 3);
  // Offline failures cannot replace the UI or discard edited fields.
  await context.setOffline(true);
  await page.clock.fastForward(15000);
  await page.waitForTimeout(100);
  assert.equal(
    await page.getByLabel("Recipient name").inputValue(),
    "Unsaved sample recipient",
  );
  await context.setOffline(false);
  await page.getByRole("button", { name: "Refresh data" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector("#workspace-error")
      .textContent.startsWith("Updated"),
  );
  await page.getByLabel("Delivery route").selectOption(f.route.id);
  await page.waitForFunction(() =>
    document
      .querySelector("#quote")
      .textContent.includes("Total before confirmation"),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const [width, height, name] of [
    [1366, 768, "vendor-1366"],
    [1920, 1080, "vendor-1920"],
    [390, 844, "vendor-mobile"],
  ]) {
    await page.setViewportSize({ width, height });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
  }
  const rider = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["geolocation"],
    geolocation: { latitude: 11.085, longitude: 7.72, accuracy: 10 },
  });
  await rider.addInitScript(
    (token) => sessionStorage.setItem("sendrack-dispatch-session", token),
    f.r.token,
  );
  const rp = await rider.newPage();
  rp.on("pageerror", (e) => errors.push(e.message));
  await rp.goto(f.base + "/app/dispatch");
  await rp.getByRole("heading", { name: "Find nearby deliveries" }).waitFor();
  const positioned = rp.waitForResponse(
    (r) => r.url().endsWith("/api/v5/location") && r.status() === 200,
  );
  await rp.getByRole("button", { name: "Allow location sharing" }).click();
  await positioned;
  await f.api(
    "/api/v3/shipments/" + shipment.id + "/pay",
    { email: "vendor@example.invalid" },
    { token: f.v.token },
  );
  await f.api(
    "/api/v3/shipments/" + shipment.id + "/verify-payment",
    {},
    { token: f.v.token },
  );
  await rp.getByRole("button", { name: "Refresh data" }).click();
  await rp.getByRole("button", { name: "Accept job" }).waitFor();
  await rp.screenshot({ path: `${shots}/rider-mobile.png`, fullPage: true });
  assert.equal(
    await rp.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await rp.getByRole("button", { name: "Accept job" }).click();
  await rp.getByRole("button", { name: "Open delivery" }).click();
  await rp.getByText("Rider assigned · holder: vendor").waitFor();
  await rp.screenshot({
    path: `${shots}/rider-assigned-mobile.png`,
    fullPage: true,
  });
  const customer = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    cp = await customer.newPage();
  cp.on("pageerror", (e) => errors.push(e.message));
  await cp.goto(f.base + "/t/" + shipment.publicToken);
  await cp
    .getByRole("heading", { name: "Verify your delivery contact" })
    .waitFor();
  await cp.getByLabel("Contact-verification code").fill("123456");
  await cp.clock.install();
  await cp.clock.fastForward(15000);
  assert.equal(
    await cp.getByLabel("Contact-verification code").inputValue(),
    "123456",
  );
  await cp.screenshot({ path: `${shots}/customer-mobile.png`, fullPage: true });
  assert(!(await cp.locator("body").innerText()).includes("08011112222"));
  const owner = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  await owner.addCookies([
    {
      name: "sendrack_owner",
      value: f.owner.cookie.split("=")[1],
      url: f.base,
    },
  ]);
  const op = await owner.newPage();
  op.on("pageerror", (e) => errors.push(e.message));
  await op.goto(f.base + "/admin/dispatch");
  await op
    .getByLabel("Authenticator code")
    .fill(totp(secret, Math.floor(Date.now() / 30000)));
  await op.getByRole("button", { name: "Unlock dispatch operations" }).click();
  await op.locator("#operations h3").first().waitFor();
  await op.getByLabel("Shipment reference").fill(shipment.id);
  await op.getByLabel("New recipient phone").fill("08022223333");
  await op.clock.install();
  for (let i = 0; i < 2; i++) {
    const response = op.waitForResponse(
      (r) => r.url().endsWith("/api/v5/admin/operations") && r.status() === 200,
    );
    await op.clock.fastForward(15000);
    await response;
  }
  assert.equal(
    await op.getByLabel("New recipient phone").inputValue(),
    "08022223333",
  );
  await op.screenshot({ path: `${shots}/owner-1366.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "Dispatch browser passed: vendor/rider/customer/owner screens, 1366/1920/mobile containment, two quiet refresh cycles preserving forms/focus/scroll/open details, offline preservation, owner authenticator unlock and customer-contact privacy. All records are local sample fixtures; no physical devices or live providers.",
  );
} finally {
  await browser.close();
  await f.close();
}
