const root = document.querySelector("#dispatch-root"),
  notice = document.querySelector("#notice");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (v) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
    (v || 0) / 100,
  );
const uid = () => crypto.randomUUID();
const field = (name, label, type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" ${extra}></label>`;
const tokenKey = "sendrack-dispatch-session",
  mfaKey = "sendrack-dispatch-mfa";
let token = sessionStorage.getItem(tokenKey) || "",
  role = null,
  me = null,
  csrf = "",
  mfa = sessionStorage.getItem(mfaKey) || "",
  selected = null,
  records = [],
  pending = false,
  watch = null,
  sharingJob = null,
  latestPosition = null,
  map = null,
  marker = null,
  mapOwner = null,
  quote = null,
  challenge = null,
  lastInbox = new Set(),
  browserAlerts = false;
const customerToken = location.pathname.match(/^\/t\/([a-f0-9]{64})$/)?.[1],
  adminMode = location.pathname === "/admin/dispatch";
let capabilities,
  consentNonce = null,
  locationGeneration = 0,
  startingLocation = false;
async function api(path, data, { admin = false, method } = {}) {
  const response = await fetch(path, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(token && !admin ? { Authorization: "Bearer " + token } : {}),
      ...(admin ? { "X-CSRF-Token": csrf, "X-Dispatch-MFA": mfa } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error || "Request failed."), {
      status: response.status,
    });
  return result;
}
function message(text) {
  notice.textContent = text;
}
function status(text) {
  const area = document.querySelector("#workspace-error");
  if (area) area.textContent = text;
  else message(text);
}
async function submit(form, fn) {
  const button =
    form.querySelector("button[type=submit]") || form.querySelector("button");
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    await fn(Object.fromEntries(new FormData(form)));
  } catch (e) {
    message(e.message);
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}
function patch(id, html) {
  const el = document.getElementById(id);
  if (el && !el.contains(document.activeElement) && el.innerHTML !== html)
    el.innerHTML = html;
}
function navigationLabel() {
  return role === "vendor" ? "Your shipments" : "Your delivery work";
}
function login() {
  root.innerHTML = `<p class="eyebrow">Dispatch preview</p><h1>Sign in to your delivery workspace.</h1><p class="muted">Use an existing SendRack account. Signup and ID uploads remain in the <a href="/app">main app</a>.</p><section class="panel" style="max-width:480px"><form id="signin" class="stack"><label>Account role<select name="role"><option value="vendor">Vendor</option><option value="rider">Rider or carrier</option></select></label>${field("phone", "Phone number", "tel", 'required autocomplete="tel" pattern="0[789][0-9]{9}"')}<button type="submit">Send sign-in code</button></form><form id="verify-signin" class="stack" hidden>${field("code", "SMS sign-in code", "text", 'required inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code"')}<button type="submit">Verify and sign in</button><button type="button" class="secondary" id="back-signin">Change phone or role</button></form></section>`;
  document.querySelector("#signin").onsubmit = (e) => {
    e.preventDefault();
    submit(e.target, async (p) => {
      challenge = await api("/api/accounts/request-code", {
        ...p,
        intent: "login",
      });
      document.querySelector("#signin").hidden = true;
      document.querySelector("#verify-signin").hidden = false;
    });
  };
  document.querySelector("#back-signin").onclick = () => {
    document.querySelector("#signin").hidden = false;
    document.querySelector("#verify-signin").hidden = true;
  };
  document.querySelector("#verify-signin").onsubmit = (e) => {
    e.preventDefault();
    submit(e.target, async (p) => {
      const result = await api("/api/accounts/verify-code", {
        challengeId: challenge.challengeId,
        code: p.code,
      });
      token = result.token;
      sessionStorage.setItem(tokenKey, token);
      await workspace();
    });
  };
}
async function workspace() {
  const session = await api("/api/v5/session");
  role = session.role;
  me = session.id;
  root.innerHTML = `<p class="eyebrow">Dispatch preview · ${esc(role)}</p><h1>${navigationLabel()}</h1><p class="tiny">Your account reference: <code>${esc(me)}</code></p><div class="buttons"><button id="refresh" class="secondary">Refresh data</button><button id="signout" class="secondary">Sign out</button></div><p class="muted" id="workspace-error" role="status"></p><div class="grid"><div>${role === "vendor" ? vendorCreate() : riderControls()}<section class="panel"><h2>${role === "vendor" ? "Created shipments" : "Offers near pickup"}</h2><div id="offers">Loading…</div></section><section class="panel"><h2>Authenticated handovers</h2><p class="muted">Accept only after checking the parcel and the person handing it over.</p><div id="handovers"></div></section><section class="panel"><h2>Assigned deliveries</h2><div id="jobs"></div></section>${role === "rider" ? '<section class="panel"><h2>Delivery inbox</h2><div id="inbox"></div></section>' : ""}</div><section class="panel" id="detail"><h2>Delivery details</h2><p>Select a shipment to see its current checkpoint.</p></section></div><footer>Preview only. Assignment reserves work; collection requires an authenticated handover. A provider accepting a notification does not guarantee device delivery.</footer>`;
  document.querySelector("#refresh").onclick = refresh;
  document.querySelector("#signout").onclick = async () => {
    await stopLocation();
    try {
      await api("/api/auth/logout", {});
    } catch {}
    token = "";
    sessionStorage.removeItem(tokenKey);
    login();
  };
  if (role === "vendor") await setupCreate();
  else {
    document.querySelector("#start-location").onclick = startLocation;
    document.querySelector("#stop-location").onclick = stopLocation;
    document.querySelector("#browser-alerts").onclick = async () => {
      if (!("Notification" in window))
        return message(
          "Browser notifications are unavailable. Your inbox still works.",
        );
      browserAlerts = (await Notification.requestPermission()) === "granted";
      message(
        browserAlerts
          ? "Foreground browser alerts enabled while this page is open."
          : "Use your delivery inbox to check offers.",
      );
    };
  }
  await refresh();
}
function riderControls() {
  return `<section class="panel"><h2>Find nearby deliveries</h2><p class="muted">Share a recent GPS fix to receive suitable offers in your service area. This browser shares only while the page stays open. Permission denial or an old position cannot count as a current location.</p><div class="buttons"><button id="start-location">Allow location sharing</button><button id="stop-location" class="secondary">Withdraw location consent</button><button id="browser-alerts" class="secondary">Enable browser alerts</button></div><p id="location-state" class="muted">Not sharing GPS.</p></section>`;
}
function vendorCreate() {
  return `<section class="panel"><h2>Create a delivery</h2><form id="create" class="stack"><label>Delivery route<select name="routeId" id="delivery-route" required><option value="">Choose a route</option></select></label>${field("recipient", "Recipient name", "text", 'required maxlength="80"')}${field("phone", "Recipient phone", "tel", 'required pattern="0[789][0-9]{9}"')}${field("address", "Delivery address", "text", 'required maxlength="240"')}${field("description", "Package requirements", "text", 'required maxlength="160"')}<label>Required vehicle<select name="requiredVehicle"><option value="bicycle">Bicycle · small parcel</option><option value="motorcycle">Motorcycle</option><option value="car">Car</option><option value="van">Van</option><option value="truck">Truck</option></select></label><button type="button" id="pickup-fix" class="secondary">Capture pickup GPS</button><p class="muted" id="pickup-status">At your pickup address, capture a real GPS fix. Do not substitute a saved or invented coordinate.</p><div id="quote" class="status">Choose a route to review the delivery charge and platform fee.</div><label class="check"><input type="checkbox" name="confirm" required><span>I have reviewed the fees, recipient details, package and suitable vehicle.</span></label><button type="submit">Confirm shipment</button></form></section>`;
}
let routes = [];
async function setupCreate() {
  routes = (await api("/api/routes")).routes;
  const select = document.querySelector("#delivery-route");
  select.innerHTML =
    '<option value="">Choose a route</option>' +
    routes
      .map(
        (r) =>
          `<option value="${esc(r.id)}">${esc(r.name)} · ${esc(r.deliveryType)}</option>`,
      )
      .join("");
  select.onchange = async () => {
    quote = null;
    document.querySelector("[name=confirm]").checked = false;
    const r = routes.find((r) => r.id === select.value);
    if (!r) return;
    try {
      quote = await api("/api/routes/" + r.id + "/quote", {
        origin: r.origin,
        originState: r.originState,
        destination: r.destination,
        destinationState: r.destinationState,
        deliveryType: r.deliveryType,
        service: "Standard",
      });
      patch(
        "quote",
        `<div class="row"><span>Handler charges</span><strong>${money(quote.handlerKobo)}</strong></div><div class="row"><span>Platform fee</span><strong>${money(quote.platformKobo)}</strong></div><div class="row"><span>Total before confirmation</span><strong>${money(quote.totalKobo)}</strong></div>`,
      );
    } catch (e) {
      message(e.message);
    }
  };
  document.querySelector("#pickup-fix").onclick = () =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(
          (p) => {
            latestPosition = fix(p);
            document.querySelector("#pickup-status").textContent =
              "Pickup GPS captured at " +
              new Date(latestPosition.observedAt).toLocaleTimeString();
          },
          () =>
            message(
              "Pickup GPS was unavailable or denied. Your completed form is preserved.",
            ),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
        )
      : message("This browser cannot provide GPS.");
  document.querySelector("#create").onsubmit = (e) => {
    e.preventDefault();
    submit(e.target, async (p) => {
      if (!quote || !latestPosition)
        throw new Error("Review the route quote and capture pickup GPS first.");
      const result = await api("/api/v5/shipments", {
        ...p,
        requestId: (e.target.dataset.requestId ||= uid()),
        routeRevision: quote.routeRevision,
        pricingRevision: quote.pricingRevision,
        totalKobo: quote.totalKobo,
        pickupCoordinates: latestPosition,
      });
      delete e.target.dataset.requestId;
      message("Shipment created. Pay the reviewed amount before dispatch.");
      await refresh();
      selectShipment(result.id);
    });
  };
}
function fix(position) {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    observedAt: Math.floor(position.timestamp),
    consent: true,
  };
}
async function startLocation() {
  if (watch !== null || startingLocation) return;
  if (!navigator.geolocation)
    return message("GPS unavailable. Your inbox remains accessible.");
  startingLocation = true;
  const generation = ++locationGeneration;
  try {
    const grant = await api("/api/v5/location/consent", { consent: true });
    if (generation !== locationGeneration) {
      await api("/api/v5/location", { stop: true });
      return;
    }
    consentNonce = grant.nonce;
  } catch (e) {
    message(e.message);
    return;
  } finally {
    startingLocation = false;
  }
  watch = navigator.geolocation.watchPosition(
    async (p) => {
      try {
        if (generation !== locationGeneration) return;
        const value = { ...fix(p), consentNonce };
        await api("/api/v5/location", value);
        if (sharingJob && generation === locationGeneration)
          await api("/api/v5/shipments/" + sharingJob + "/location", value);
        document.querySelector("#location-state").textContent =
          "Real GPS observed " +
          new Date(value.observedAt).toLocaleTimeString() +
          ".";
      } catch (e) {
        message(e.message);
      }
    },
    () => {
      stopLocation();
      message(
        "Location permission was denied or GPS was unavailable. Sharing stopped.",
      );
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
}
async function stopLocation() {
  locationGeneration++;
  consentNonce = null;
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null;
  const job = sharingJob;
  sharingJob = null;
  if (token && role === "rider") {
    try {
      await api("/api/v5/location", { stop: true });
      if (job)
        await api("/api/v5/shipments/" + job + "/location", { stop: true });
    } catch {
      message(
        "Consent was withdrawn locally. Server positions expire within two minutes if the network is unavailable.",
      );
    }
  }
  const state = document.querySelector("#location-state");
  if (state) state.textContent = "Location sharing stopped.";
}
async function refresh() {
  if (pending || document.hidden || !token) return;
  pending = true;
  try {
    const [jobs, handovers] = await Promise.all([
      api("/api/v5/shipments"),
      api("/api/v5/handovers"),
    ]);
    records = jobs.shipments;
    patch(
      "jobs",
      records
        .map(
          (s) =>
            `<article class="item"><h3>${esc(s.code)}</h3><p>${esc(s.origin)} → ${esc(s.destination)}</p><p class="muted">${esc(s.status)}</p><button class="secondary" data-select="${esc(s.id)}">Open delivery</button></article>`,
        )
        .join("") || '<p class="muted">No assigned deliveries yet.</p>',
    );
    patch(
      "handovers",
      handovers.handovers
        .map(
          (h) =>
            `<article class="item"><p>${esc(h.shipment_id)}</p><p class="muted">${esc(h.from_leg)} → ${esc(h.to_leg)} · expires ${new Date(h.expires).toLocaleTimeString()}</p>${h.to_id === me ? `<div class="buttons"><button data-transfer="${h.id}" data-decision="accept">Accept physical parcel</button><button class="secondary" data-transfer="${h.id}" data-decision="reject">Reject transfer</button></div>` : "<p>Awaiting intended handler acceptance. Custody has not changed.</p>"}</article>`,
        )
        .join("") || '<p class="muted">No pending handovers.</p>',
    );
    if (role === "rider") {
      const [offers, inbox] = await Promise.all([
        api("/api/v5/offers"),
        api("/api/v5/inbox"),
      ]);
      patch(
        "offers",
        offers.offers
          .map(
            (o) =>
              `<article class="item"><h3>${esc(o.pickupArea)} → ${esc(o.destination)}</h3><p>${esc(o.description)} · ${esc(o.allowedVehicles.join(", "))}</p><p>Your fee: <strong>${money(o.earningsKobo)}</strong></p><div class="buttons"><button data-offer="${o.offerId}" data-decision="accept">Accept job</button><button class="secondary" data-offer="${o.offerId}" data-decision="decline">Decline</button></div></article>`,
          )
          .join("") ||
          '<p class="muted">No current eligible offers. Fresh GPS, approved ID, service area, vehicle, capacity and payment are required.</p>',
      );
      patch(
        "inbox",
        inbox.notifications
          .map(
            (n) =>
              `<article class="item"><h3>${esc(n.title)}</h3><p class="muted">${new Date(n.created).toLocaleString()}</p></article>`,
          )
          .join("") ||
          '<p class="muted">Your inbox will keep delivery alerts even if push is unavailable.</p>',
      );
      if (browserAlerts && lastInbox.size)
        for (const n of inbox.notifications)
          if (!lastInbox.has(n.id))
            new Notification("SendRack delivery update", {
              body: "Open your delivery inbox.",
              tag: n.id,
            });
      lastInbox = new Set(inbox.notifications.map((n) => n.id));
    } else
      patch(
        "offers",
        '<p class="muted">Unpaid shipments remain undispatched. Open a shipment below to pay or confirm payment.</p>',
      );
    if (selected) await refreshDetail();
    status("Updated " + new Date().toLocaleTimeString() + ".");
  } catch (e) {
    if (selected) updateMap(null);
    status(
      "Connection interrupted. Your forms and current page are preserved. " +
        e.message,
    );
  } finally {
    pending = false;
  }
}
function selectShipment(id) {
  selected = id;
  const s = records.find((s) => s.id === id);
  if (!s) return;
  root.querySelector("#detail").innerHTML =
    `<h2>${esc(s.code)}</h2><div id="shipment-summary"></div><div id="journey"></div><div id="gps-state"></div><div id="live-map" class="map" hidden></div><div id="navigation"></div><form id="pay-form" class="stack" hidden><h3>Payment</h3>${field("email", "Payer email", "email", "required")}<button type="submit">Pay reviewed delivery charge</button><button id="verify-pay" type="button" class="secondary">Check payment</button></form><form id="progress-form" class="stack" hidden><label>Next checkpoint<select name="action"><option value="travel">Travelling to pickup</option><option value="arrive">Arrived at pickup</option><option value="depart-carrier">Begin carrier journey</option><option value="arrive-carrier">Carrier arrived</option><option value="depart-final">Begin final delivery</option></select></label><button type="submit">Record checkpoint</button></form><form id="handover-form" class="stack"><h3>Offer physical handover</h3>${field("toId", "Intended handler reference", "text", "required")}<button type="submit">Offer parcel to this handler</button><p class="muted">The current holder keeps custody until the intended handler authenticates and accepts.</p></form><form id="complete-form" class="stack" hidden><h3>Customer delivery confirmation</h3>${field("code", "Delivery code from customer", "text", 'required inputmode="numeric" pattern="[0-9]{6}" autocomplete="off"')}<button type="submit">Confirm parcel received</button><button type="button" class="secondary" id="renew-code">Renew code to verified customer</button><p class="muted">Ask for the code only after handing the parcel to the customer. The rider cannot view the code.</p></form><div class="buttons" id="job-location" hidden><button class="secondary" id="share-job">Share my GPS for this parcel</button></div><details><summary>Report a parcel problem</summary><form id="incident-form" class="stack"><label>Incident<select name="kind"><option value="damage">Damage</option><option value="wrong-recipient">Wrong recipient</option><option value="dispute">Dispute</option><option value="cancel-request">Request cancellation</option></select></label><button type="submit">Pause and request review</button></form></details>`;
  map?.remove();
  map = null;
  marker = null;
  mapOwner = null;
  for (const [id, action] of [
    ["progress-form", "progress"],
    ["handover-form", "handover"],
    ["complete-form", "complete"],
    ["incident-form", "incident"],
  ])
    document.getElementById(id).onsubmit = (e) => {
      e.preventDefault();
      submit(e.target, async (p) => {
        await api(`/api/v5/shipments/${selected}/${action}`, {
          ...p,
          requestId: (e.target.dataset.requestId ||= uid()),
        });
        delete e.target.dataset.requestId;
        message("Checkpoint saved.");
        if (action === "complete") e.target.reset();
        await refresh();
      });
    };
  document.querySelector("#pay-form").onsubmit = (e) => {
    e.preventDefault();
    submit(e.target, async (p) => {
      const payment = await api(`/api/v3/shipments/${selected}/pay`, p);
      if (payment.authorizationUrl) location.assign(payment.authorizationUrl);
      else if (payment.authorization_url)
        location.assign(payment.authorization_url);
      else message("Payment is already confirmed.");
    });
  };
  document.querySelector("#verify-pay").onclick = async () => {
    try {
      await api(`/api/v3/shipments/${selected}/verify-payment`, {});
      message("Payment checked with provider.");
      await refresh();
    } catch (e) {
      message(e.message);
    }
  };
  document.querySelector("#renew-code").onclick = async () => {
    try {
      await api(`/api/v5/shipments/${selected}/renew-code`, {
        requestId: uid(),
      });
      message("Renewal requested directly to verified customer.");
    } catch (e) {
      message(e.message);
    }
  };
  document.querySelector("#share-job").onclick = () => {
    sharingJob = selected;
    startLocation();
  };
  refreshDetail().catch((e) => message(e.message));
}
async function refreshDetail() {
  const requested = selected,
    s = await api("/api/v5/shipments/" + requested);
  if (selected !== requested) return;
  patch(
    "shipment-summary",
    `<p class="status">${esc(s.status)} · holder: ${esc(s.custodian)}</p><p>${esc(s.description)} · ${esc(s.origin)} → ${esc(s.destination)}</p>${s.phone ? `<p>Recipient: ${esc(s.recipient)} · ${esc(s.phone)}<br>${esc(s.address)}</p>` : ""}${s.pickupAddress ? `<p>Pickup: ${esc(s.pickupAddress)}</p>` : ""}${role === "vendor" ? `<p>Total ${money(s.payment.amount)} · platform ${money(s.pricingBreakdown?.platformKobo)} · ${esc(s.payment.status)}</p><p><a href="${esc(records.find((r) => r.id === selected)?.trackingPath || "#")}">Open customer tracking and contact verification</a></p>${records.find((r) => r.id === selected)?.actors?.pickup ? `<p class="tiny">Assigned pickup reference: ${esc(records.find((r) => r.id === selected).actors.pickup.id)}</p>` : ""}` : `<p>Agreed leg earnings: ${money(s.earningsKobo)}</p>`}`,
  );
  patch("journey", timeline(s.events));
  const leg = s.deliveryType === "interstate" ? "lastmile" : "pickup";
  document.querySelector("#pay-form").hidden =
    role !== "vendor" || s.payment?.status === "paid";
  const checkpoints = {
    "Rider assigned": ["pickup", "travel"],
    "Rider travelling to pickup": ["pickup", "arrive"],
    "Carrier received parcel": ["carrier", "depart-carrier"],
    "In transit": ["carrier", "arrive-carrier"],
    "Parcel collected":
      s.deliveryType === "intrastate" ? ["pickup", "depart-final"] : null,
    "Last-mile rider received parcel": ["lastmile", "depart-final"],
  };
  const next = checkpoints[s.status];
  document.querySelector("#progress-form").hidden =
    role !== "rider" || !next || next[0] !== s.jobLeg;
  if (next) {
    const select = document.querySelector("#progress-form select");
    for (const option of select.options)
      option.disabled = option.value !== next[1];
    select.value = next[1];
  }
  document.querySelector("#handover-form").hidden = !(
    (role === "vendor" && s.status === "Rider arrived") ||
    (role === "rider" &&
      s.carrying &&
      ((s.deliveryType === "interstate" &&
        ["Parcel collected", "Carrier arrived"].includes(s.status)) ||
        s.status === "Out for delivery"))
  );
  document.querySelector("#complete-form").hidden =
    role !== "rider" ||
    !s.carrying ||
    s.status !== "Out for delivery" ||
    s.custodian !== leg;
  document.querySelector("#job-location").hidden =
    role !== "rider" ||
    !s.carrying ||
    ["vendor", "customer"].includes(s.custodian) ||
    ["Delivered", "Cancelled"].includes(s.status);
  updateMap(s.customerTracking?.location);
  const destination =
    s.pickupAddress &&
    ["Rider assigned", "Rider travelling to pickup", "Rider arrived"].includes(
      s.status,
    )
      ? s.pickupAddress
      : s.address;
  patch(
    "navigation",
    destination
      ? `<p><a class="button secondary" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}" target="_blank" rel="noopener noreferrer">Open navigation to next destination</a></p>`
      : '<p class="muted">Precise navigation is available only to the authorized handler at the appropriate checkpoint.</p>',
  );
}
function timeline(events) {
  return (
    '<ol class="timeline">' +
    (events || [])
      .map(
        (e) =>
          `<li><strong>${esc(e.status)}</strong><time>${new Date(e.at).toLocaleString()}</time></li>`,
      )
      .join("") +
    "</ol>"
  );
}
function updateMap(position) {
  const text = document.querySelector("#gps-state"),
    container = document.querySelector("#live-map");
  if (!text || !container) return;
  if (!position) {
    text.textContent =
      "No recent shared GPS fix. The handler may be offline or sharing may have ended.";
    container.hidden = true;
    if (map) {
      map.remove();
      map = null;
      marker = null;
    }
    return;
  }
  text.textContent =
    "GPS observed " +
    new Date(position.at).toLocaleTimeString() +
    ` · accuracy ${Math.round(position.accuracy)} m. No arrival estimate is inferred.`;
  container.hidden = false;
  if (!window.L) return;
  if (!map) {
    map = L.map(container).setView([position.lat, position.lng], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    marker = L.marker([position.lat, position.lng]).addTo(map);
  } else marker.setLatLng([position.lat, position.lng]);
  map.invalidateSize();
}
root.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  if (b.dataset.select) {
    selectShipment(b.dataset.select);
    return;
  }
  if (!b.dataset.offer && !b.dataset.transfer) return;
  b.disabled = true;
  try {
    const path = b.dataset.offer
      ? `/api/v5/offers/${b.dataset.offer}/${b.dataset.decision}`
      : `/api/v5/handovers/${b.dataset.transfer}/${b.dataset.decision}`;
    await api(path, { requestId: uid() });
    await refresh();
  } catch (error) {
    message(error.message);
  } finally {
    if (b.isConnected) b.disabled = false;
  }
});
async function customer() {
  root.innerHTML = `<p class="eyebrow">Customer tracking · no signup needed</p><h1>Your delivery, in view.</h1><section class="panel"><div id="public-summary"></div><div id="journey"></div><div id="gps-state"></div><div id="live-map" class="map" hidden></div><p id="workspace-error" class="muted"></p></section><section class="panel" id="contact-panel"><h2>Verify your delivery contact</h2><p class="muted">We send a contact-verification code to the recipient phone recorded for this parcel. This is separate from your delivery code and from signup.</p><button id="contact-request">Send contact-verification code</button><form id="contact-verify" class="stack">${field("code", "Contact-verification code", "text", 'required inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code"')}<button type="submit">Verify recipient contact</button></form><p class="status">Keep your delivery code private until you have received the parcel. It is sent directly to your verified contact when the final-delivery stage begins.</p></section>`;
  document.querySelector("#contact-request").onclick = async () => {
    try {
      await api("/api/v5/customer/" + customerToken, {
        action: "request-contact-code",
      });
      message("Contact-verification code queued for the recorded recipient.");
    } catch (e) {
      message(e.message);
    }
  };
  document.querySelector("#contact-verify").onsubmit = (e) => {
    e.preventDefault();
    submit(e.target, async (p) => {
      await api("/api/v5/customer/" + customerToken, {
        action: "verify-contact",
        code: p.code,
      });
      message("Recipient contact verified. Delivery codes remain private.");
      e.target.reset();
      await customerRefresh();
    });
  };
  await customerRefresh();
}
let customerBusy = false;
async function customerRefresh() {
  if (customerBusy || document.hidden) return;
  customerBusy = true;
  try {
    const s = await api("/api/track/" + customerToken);
    patch(
      "public-summary",
      `<h2>${esc(s.code)}</h2><p class="status">${esc(s.status)}</p><p>${esc(s.business)} · ${esc(s.origin)} → ${esc(s.destination)}</p><p class="muted">${esc(s.deliveryCodeStatus || "Delivery code not yet issued")}</p>`,
    );
    patch("journey", timeline(s.events));
    updateMap(s.location);
    document.querySelector("#contact-panel").hidden = s.status === "Delivered";
    document.querySelector("#contact-request").hidden = Boolean(
      s.contactVerified,
    );
    document.querySelector("#contact-verify").hidden = Boolean(
      s.contactVerified,
    );
    document.querySelector("#contact-panel h2").textContent = s.contactVerified
      ? "Recipient contact verified"
      : "Verify your delivery contact";
    status("Last checked " + new Date().toLocaleTimeString());
  } catch (e) {
    status(
      "Tracking unavailable or connection interrupted. No live location is claimed. " +
        e.message,
    );
    updateMap(null);
  } finally {
    customerBusy = false;
  }
}
async function owner() {
  try {
    const session = await api("/api/admin/session", undefined, { admin: true });
    csrf = session.csrf;
    root.innerHTML = `<p class="eyebrow">Owner dispatch preview</p><h1>Delivery operations</h1><p class="muted">Existing owner login plus a 15-minute authenticator unlock. Individual staff permissions remain a separate release.</p><section class="panel"><form id="unlock" class="stack">${field("code", "Authenticator code", "text", 'required pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code"')}<button type="submit">Unlock dispatch operations</button></form><p id="workspace-error" class="muted"></p></section><div class="grid"><section class="panel"><h2>Queues and incidents</h2><div id="operations"></div></section><section class="panel"><h2>Controlled shipment action</h2><form id="operation-form" class="stack">${field("shipmentId", "Shipment reference", "text", "required")}<label>Action<select name="action"><option value="retry-notifications">Retry failed notifications</option><option value="reassign-pickup">Reopen pre-collection assignment</option><option value="approve-final-replacement">Approve physical final-handler replacement</option><option value="change-recipient">Change recipient contact; invalidate codes</option><option value="resolve-incident">Continue with recorded holder</option><option value="cancel">Cancel before collection</option><option value="revoke-tracking">Revoke customer link</option><option value="grant-carrier">Grant scoped carrier permission</option></select></label>${field("riderId", "Replacement / carrier handler reference")}${field("phone", "New recipient phone", "tel")}<label class="check"><input type="checkbox" required><span>I checked the shipment and understand this action is audited. Physical custody cannot be silently reassigned.</span></label><button type="submit">Apply controlled action</button></form></section></div>`;
    document.querySelector("#unlock").onsubmit = (e) => {
      e.preventDefault();
      submit(e.target, async (p) => {
        const result = await api("/api/v5/admin/unlock", p, { admin: true });
        mfa = result.token;
        sessionStorage.setItem(mfaKey, mfa);
        e.target.reset();
        await ownerRefresh();
      });
    };
    document.querySelector("#operation-form").onsubmit = (e) => {
      e.preventDefault();
      submit(e.target, async (p) => {
        await api(
          "/api/v5/admin/shipments/" + encodeURIComponent(p.shipmentId),
          { ...p, resolution: "continue-with-current-holder" },
          { admin: true },
        );
        message("Audited operation saved.");
        await ownerRefresh();
      });
    };
    if (mfa) await ownerRefresh();
  } catch (e) {
    root.innerHTML =
      '<h1>Owner login required.</h1><p><a class="button" href="/admin">Open owner dashboard</a></p>';
    message(e.message);
  }
}
let ownerBusy = false;
async function ownerRefresh() {
  if (ownerBusy || document.hidden || !mfa) return;
  ownerBusy = true;
  try {
    const data = await api("/api/v5/admin/operations", undefined, {
      admin: true,
    });
    patch(
      "operations",
      Object.entries(data)
        .map(
          ([name, rows]) =>
            `<h3>${esc(name)}</h3>${rows.length ? rows.map((row) => `<article class="item"><code>${esc(row.shipment_id)}</code><p>${esc(row.state || row.kind)}${row.attempts ? " · attempts " + row.attempts : ""}</p><p class="tiny">${esc(row.id || "")}</p></article>`).join("") : '<p class="muted">Nothing waiting.</p>'}`,
        )
        .join(""),
    );
    status("Updated " + new Date().toLocaleTimeString());
  } catch (e) {
    status(e.message);
  } finally {
    ownerBusy = false;
  }
}
async function init() {
  if (customerToken) return customer();
  capabilities = await api("/api/v5/capabilities");
  if (!capabilities.enabled) {
    root.innerHTML =
      '<h1>Dispatch preview is not active.</h1><p>Your existing deliveries remain available in the <a href="/app">main app</a>.</p><p class="muted">' +
      esc(capabilities.reason) +
      "</p>";
    return;
  }
  if (adminMode) return owner();
  if (token) {
    try {
      return await workspace();
    } catch (e) {
      if (e.status !== 401) message(e.message);
    }
  }
  login();
}
init().catch((e) => {
  root.innerHTML =
    '<h1>Unable to load dispatch.</h1><p>Your connection may be interrupted. <a href="/app">Open the main app</a>.</p>';
  message(e.message);
});
setInterval(() => {
  if (customerToken) customerRefresh();
  else if (adminMode) ownerRefresh();
  else refresh();
}, 15000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && watch !== null) stopLocation();
});

root.addEventListener("input", (e) => {
  if (e.target.form) delete e.target.form.dataset.requestId;
});
