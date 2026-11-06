import {
  stageColors,
  gpsState,
  matchesOperations,
  carrierGroups,
  clusterGroups,
} from "/admin/live-map-model.mjs";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const date = (value) =>
  value
    ? new Date(value).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })
    : "Not received";
export function liveOperationsMap({
  fetchFeed,
  canFetch = () => true,
  pollMs = 10000,
}) {
  const element = document.createElement("section");
  element.id = "live-operations";
  element.className = "panel live-operations";
  element.innerHTML = `<div class="panel-head"><div><h2>Live Operations Map</h2><p class="muted">Current-holder GPS · recorded fixes, never simulated movement</p></div><button class="secondary" data-map-refresh>Reconnect / refresh</button></div><div class="map-filters"><label>State<select name="state" aria-label="Map state"><option value="">All states</option></select></label><label>City<select name="city" aria-label="Map city"><option value="">All cities</option></select></label><label>Route<select name="route" aria-label="Map route"><option value="">All routes</option></select></label><label>Status<select name="status" aria-label="Map status"><option value="">All stages</option></select></label><label>Custody chain<select name="type" aria-label="Map custody chain"><option value="">Both chains</option><option value="intrastate">Intrastate</option><option value="interstate">Interstate</option><option value="legacy">Earlier workflow</option></select></label><label class="map-search">Shipment search<input name="search" aria-label="Map shipment search" placeholder="Tracking reference, route or city" maxlength="100"></label><label class="map-lastknown"><input name="showStale" type="checkbox">Show last known positions (grey)</label></div><p class="map-connection" role="status" aria-live="polite">Connecting to authorized operations…</p><p class="map-tiles-status muted" role="status" aria-live="polite">Map tiles not checked yet.</p><div class="map-legend">${Object.entries(
    {
      waiting: "Awaiting assignment",
      assigned: "Assigned / pickup travel",
      pickup: "Pickup holder",
      carrier: "Carrier",
      lastmile: "Final delivery holder",
      incident: "Incident",
      stale: "Last known / stale",
      mixed: "Mixed-stage cluster",
    },
  )
    .map(
      ([key, label]) =>
        `<span><i style="background:${stageColors[key]}"></i>${label}</span>`,
    )
    .join(
      "",
    )}</div><div class="operations-layout"><div><div class="operations-map" aria-label="Active shipment locations"></div><div class="map-empty" role="status"><h3>No fresh GPS data yet</h3><p>Active shipments will appear here when an authorized current holder shares a recent GPS fix. No location is guessed.</p></div><p class="map-count muted"></p><div class="map-cluster-list" hidden></div><details class="map-active-section"><summary>Active shipments matching filters</summary><div class="map-active-list"></div></details></div><aside class="map-detail" aria-label="Selected shipment detail"><h3>Shipment detail</h3><p class="muted">Select a marker, cluster entry or attention item.</p></aside></div><details class="attention-section" open><summary>Needs Attention <span class="attention-count">0</span></summary><div class="map-attention"></div></details>`;
  const filters = {
    state: "",
    city: "",
    route: "",
    status: "",
    type: "",
    search: "",
    showStale: false,
  };
  const records = new Map(),
    markers = new Map();
  let map = null,
    tiles = null,
    cursor = null,
    flight = null,
    controller = null,
    disposed = false,
    selected = null,
    clusterIds = null,
    connected = false,
    initialized = false,
    failures = 0,
    lastAttempt = 0,
    serverAt = Date.now(),
    clockAt = performance.now(),
    freshTimer = null,
    nextExpiry = Infinity;
  const clock = () => serverAt + performance.now() - clockAt;
  const stateLine = element.querySelector(".map-connection");
  const view = {
    get map() {
      return map;
    },
    element,
    get selected() {
      return selected;
    },
    get filters() {
      return { ...filters };
    },
    get records() {
      return records;
    },
    get markerCount() {
      return markers.size;
    },
    get connected() {
      return connected;
    },
  };
  function select(id) {
    selected = id;
    renderDetail();
  }
  function renderDetail() {
    const target = element.querySelector(".map-detail"),
      s = records.get(selected);
    if (!selected) return;
    if (!s) {
      target.innerHTML =
        "<h3>Live tracking ended</h3><p>This shipment was completed, cancelled, removed from your scope or is no longer active. Its live marker has been removed.</p>";
      return;
    }
    const freshness = gpsState(s, clock()),
      within = matchesOperations(s, filters);
    target.innerHTML = `<h3>${esc(s.code)}</h3><p class="map-stage">${esc(s.status)}</p><p>${esc(s.origin)}, ${esc(s.originState)} → ${esc(s.destination)}, ${esc(s.destinationState)}</p><p>${esc(s.deliveryType)} · current holder: <strong>${esc(s.custodian)}</strong></p><p class="map-freshness">${freshness === "fresh" ? (connected ? "Recent authorized GPS" : "Recent fix · feed disconnected") : freshness === "stale" ? "Last known GPS · stale, not live" : "No authorized current-holder GPS"}</p><p class="muted">Server received: ${esc(date(s.gps.receivedAt))}<br>GPS observed: ${esc(date(s.gps.observedAt))}${s.gps.position ? "<br>Reported accuracy: " + Math.round(s.gps.position.accuracy) + " m" : ""}</p>${!within ? '<p class="note">Selected shipment is outside the current filters; your selection is retained.</p>' : ""}${s.attention.length ? "<ul>" + s.attention.map((r) => "<li>" + esc(r) + "</li>").join("") + "</ul>" : ""}<h4>Custody checkpoints</h4><ol class="map-history">${s.events.map((e) => `<li><strong>${esc(e.status)}</strong><small>${esc(e.leg)} · ${esc(date(e.at))}</small></li>`).join("")}</ol>${s.gps.position ? `<button type="button" class="secondary" data-map-locate="${esc(s.id)}">Locate recorded fix</button>` : ""}<p class="muted">No customer contacts, precise addresses, identity documents or delivery codes are included in this map feed.</p>`;
  }
  function options() {
    const values = [...records.values()];
    for (const [key, label, get] of [
      ["state", "All states", (r) => [r.originState, r.destinationState]],
      ["city", "All cities", (r) => [r.origin, r.destination]],
      ["route", "All routes", (r) => [r.routeId || r.routeName]],
      ["status", "All stages", (r) => [r.status]],
    ]) {
      const select = element.querySelector(`[name=${key}]`);
      if (select === document.activeElement) continue;
      const set = new Set(values.flatMap(get).filter(Boolean));
      if (filters[key]) set.add(filters[key]);
      const list = [...set].sort();
      const signature = JSON.stringify(list);
      if (select.dataset.signature === signature) continue;
      select.dataset.signature = signature;
      select.innerHTML =
        '<option value="">' +
        label +
        "</option>" +
        list
          .map(
            (v) =>
              `<option value="${esc(v)}">${esc(key === "route" ? values.find((r) => (r.routeId || r.routeName) === v)?.routeName || v : v)}</option>`,
          )
          .join("");
      select.value = filters[key];
    }
  }
  function icon(cell) {
    const count = cell.records.length,
      color =
        cell.freshness === "stale"
          ? stageColors.stale
          : stageColors[cell.stage] || "#334155";
    const carrier = cell.groups.length === 1 && cell.groups[0].carrier;
    return L.divIcon({
      className:
        "operations-marker" +
        (cell.freshness === "stale" ? " stale" : "") +
        (!connected ? " disconnected" : ""),
      html: `<span style="background:${color}" aria-label="${count} shipment${count === 1 ? "" : "s"}${carrier ? ", same carrier" : ""}${cell.freshness === "stale" ? ", last known stale location" : ""}">${count > 1 ? count : "●"}${carrier && count > 1 ? "<b>C</b>" : ""}</span>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }
  function renderMarkers() {
    if (!map || disposed) return;
    nextExpiry = Infinity;
    for (const s of records.values())
      if (gpsState(s, clock()) === "fresh")
        nextExpiry = Math.min(nextExpiry, s.gps.freshUntil);
    const filtered = [...records.values()].filter((s) =>
        matchesOperations(s, filters),
      ),
      groups = carrierGroups(filtered, {
        now: clock(),
        showStale: filters.showStale,
      }).filter((g) =>
        map.getBounds().pad(0.2).contains([g.point.lat, g.point.lng]),
      );
    const cells = clusterGroups(groups, (p) =>
      map.project([p.lat, p.lng], map.getZoom()),
    );
    const alive = new Set();
    for (const cell of cells) {
      const key = cell.key;
      alive.add(key);
      const position = map.unproject([cell.x, cell.y], map.getZoom()),
        signature = JSON.stringify([
          cell.stage,
          cell.freshness,
          connected,
          cell.records.map((r) => r.id),
          cell.groups.length,
        ]);
      let marker = markers.get(key);
      if (!marker) {
        marker = L.marker(position, {
          icon: icon(cell),
          keyboard: true,
          alt: "Authorized shipment location",
        }).addTo(map);
        marker.on("click", () => {
          const current = marker.operationsCell;
          if (current.records.length === 1) {
            select(current.records[0].id);
            clusterIds = null;
            element.querySelector(".map-cluster-list").hidden = true;
          } else {
            clusterIds = current.records.map((r) => r.id);
            renderCluster();
          }
        });
        markers.set(key, marker);
      } else {
        marker.setLatLng(position);
        if (marker.operationsSignature !== signature)
          marker.setIcon(icon(cell));
      }
      marker.operationsCell = cell;
      marker.operationsSignature = signature;
    }
    for (const [key, marker] of markers)
      if (!alive.has(key)) {
        marker.remove();
        markers.delete(key);
      }
    const fresh = filtered.filter(
      (s) => gpsState(s, clock()) === "fresh",
    ).length;
    const empty = element.querySelector(".map-empty");
    empty.hidden = cells.length > 0;
    if (!empty.hidden) {
      const title =
        records.size === 0
          ? "No active shipments yet"
          : filtered.length === 0
            ? "No shipments match these filters"
            : fresh === 0
              ? "No fresh GPS data yet"
              : "No matching positions in this view";
      const copy =
        fresh === 0
          ? "Recent observation and receipt timestamps, current custody, consent and an active session are required. Older or missing GPS is not shown as live. Use the shipment and attention lists below."
          : "Pan or zoom out, adjust filters, or use Locate recorded fix in the shipment detail panel.";
      empty.innerHTML = "<h3>" + title + "</h3><p>" + copy + "</p>";
    }
    element.querySelector(".map-count").textContent =
      `${filtered.length} authorized active shipment(s) · ${fresh} recent fixes · ${filtered.length - fresh} without current GPS · ${cells.length} grouped map marker(s). Grey last-known positions are optional.`;
    const attention = filtered
      .map((s) => ({
        ...s,
        reasons: [
          ...s.attention,
          ...(gpsState(s, clock()) === "stale" && s.gps.state === "fresh"
            ? ["GPS expired since last feed update"]
            : []),
        ],
      }))
      .filter((s) => s.reasons.length)
      .sort((a, b) => {
        const rank = (s) =>
          s.stage === "incident"
            ? 0
            : s.reasons.some((r) => /failed|expired|exhausted/.test(r))
              ? 1
              : s.gps.state === "stale"
                ? 2
                : 3;
        return rank(a) - rank(b) || a.code.localeCompare(b.code);
      });
    element.querySelector(".attention-count").textContent = String(
      attention.length,
    );
    const list = element.querySelector(".map-attention");
    if (!list.contains(document.activeElement)) {
      list.innerHTML =
        attention
          .slice(0, 100)
          .map(
            (s) =>
              `<button type="button" class="map-attention-item" data-map-shipment="${esc(s.id)}"><strong>${esc(s.code)}</strong><span>${esc(s.status)} · ${esc(s.reasons.join(" · "))}</span></button>`,
          )
          .join("") ||
        '<p class="muted">No attention flags within the current filters.</p>';
      if (attention.length > 100)
        list.insertAdjacentHTML(
          "beforeend",
          `<p class="muted">Showing 100 of ${attention.length}. Narrow the filters or search for a shipment.</p>`,
        );
    }
    const activeList = element.querySelector(".map-active-list");
    if (!activeList.contains(document.activeElement))
      activeList.innerHTML =
        filtered
          .slice(0, 100)
          .map(
            (s) =>
              `<button type="button" class="map-attention-item" data-map-shipment="${esc(s.id)}">${esc(s.code)} · ${esc(s.status)} · ${gpsState(s, clock()) === "fresh" ? "Recent GPS" : "No current GPS"}</button>`,
          )
          .join("") +
        (filtered.length > 100
          ? `<p class="muted">100 of ${filtered.length} shown. Search or filter to locate another shipment.</p>`
          : "");
    if (selected) renderDetail();
    if (clusterIds) renderCluster();
  }
  function renderCluster() {
    const target = element.querySelector(".map-cluster-list"),
      list =
        clusterIds
          ?.map((id) => records.get(id))
          .filter((s) => s && matchesOperations(s, filters)) || [];
    target.hidden = !list.length;
    if (target.contains(document.activeElement)) return;
    target.innerHTML = `<h4>Shipments at this grouped location (${list.length})</h4><p class="muted">C marks parcels sharing one carrier's recent position. Individual timestamps remain in shipment details. Search narrows large groups; up to 200 entries are shown here.</p>${list
      .slice(0, 200)
      .map(
        (s) =>
          `<button type="button" class="map-attention-item" data-map-shipment="${esc(s.id)}">${esc(s.code)} · ${esc(s.status)} · ${esc(s.custodian)}</button>`,
      )
      .join("")}`;
  }
  function apply(feed, latency = 0) {
    if (feed.reset) records.clear();
    for (const id of feed.removed) records.delete(id);
    for (const s of feed.upserts) records.set(s.id, s);
    cursor = feed.cursor;
    serverAt = Date.parse(feed.serverTime) + Math.max(0, latency);
    clockAt = performance.now();
    connected = true;
    failures = 0;
    stateLine.textContent =
      "Connected · server update " +
      date(feed.serverTime) +
      " · GPS freshness expires after 2 minutes.";
    stateLine.classList.remove("offline");
    options();
    if (!map) {
      if (!window.L) {
        stateLine.textContent =
          "Map library unavailable. Shipment details remain available.";
        return;
      }
      map = L.map(element.querySelector(".operations-map"), {
        preferCanvas: true,
        zoomAnimation: false,
        markerZoomAnimation: false,
      }).setView([9.08, 8.68], 6);
      const tileStatus = element.querySelector(".map-tiles-status");
      let tileFailures = 0;
      tiles = L.tileLayer(feed.maps.tileUrl, {
        attribution: feed.maps.attribution,
        maxZoom: feed.maps.maxZoom,
        // Send only the origin to external tiles, never tracking tokens/private paths.
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      tiles.on("loading", () => {
        tileFailures = 0;
        tileStatus.textContent = "Loading map tiles…";
      });
      tiles.on("tileerror", () => {
        tileFailures++;
        tileStatus.textContent = "Map tiles unavailable. Shipment-feed connection does not confirm tile access.";
      });
      tiles.on("load", () => {
        if (!tileFailures) tileStatus.textContent = "Map tiles loaded for the current view.";
      });
      tiles.addTo(map);
      map.on("zoomend moveend", renderMarkers);
    }
    if (!initialized) {
      const points = [...records.values()]
        .filter((s) => gpsState(s, clock()) === "fresh")
        .map((s) => [s.gps.position.lat, s.gps.position.lng]);
      if (points.length) {
        map.fitBounds(points, {
          padding: [24, 24],
          maxZoom: 12,
          animate: false,
        });
        initialized = true;
      }
    }
    renderMarkers();
  }
  async function refresh(force = false) {
    if (disposed || flight || !element.isConnected || !canFetch())
      return flight;
    if (
      !force &&
      Date.now() - lastAttempt <
        Math.min(60000, pollMs * 2 ** Math.min(failures, 3))
    )
      return;
    lastAttempt = Date.now();
    controller = new AbortController();
    const started = performance.now();
    const work = (async () => {
      try {
        const feed = await fetchFeed(
          cursor,
          AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        );
        if (!disposed) apply(feed, performance.now() - started);
      } catch (error) {
        if (disposed) return;
        connected = false;
        failures++;
        if (error.status === 401 || error.status === 403) {
          records.clear();
          cursor = null;
          for (const marker of markers.values()) marker.remove();
          markers.clear();
          stateLine.textContent =
            "Operations access expired or was denied. Sign in again.";
          renderDetail();
        } else
          stateLine.textContent =
            "Connection lost · automatic reconnect will preserve zoom, filters and selection. Displayed fixes expire at their recorded freshness deadline.";
        stateLine.classList.add("offline");
        renderMarkers();
      } finally {
        flight = null;
        controller = null;
      }
    })();
    flight = work;
    return work;
  }
  function attach(host) {
    if (disposed) return;
    if (host !== element) host.replaceWith(element);
    if (map) map.invalidateSize({ pan: false });
    void refresh(true);
  }
  element.querySelector("[data-map-refresh]").onclick = () => refresh(true);
  element.querySelector(".map-filters").addEventListener("input", (e) => {
    const name = e.target.name;
    if (!(name in filters)) return;
    filters[name] = name === "showStale" ? e.target.checked : e.target.value;
    renderMarkers();
  });
  element.addEventListener("click", (e) => {
    const button = e.target.closest("[data-map-shipment]");
    if (button) select(button.dataset.mapShipment);
    const locate = e.target.closest("[data-map-locate]");
    if (locate) {
      const s = records.get(locate.dataset.mapLocate);
      if (s?.gps.position)
        map?.panTo([s.gps.position.lat, s.gps.position.lng], {
          animate: false,
        });
    }
  });
  const visible = () => {
    if (!document.hidden && element.isConnected) {
      renderMarkers();
      void refresh(true);
    }
  };
  document.addEventListener("visibilitychange", visible);
  const poll = setInterval(() => refresh(), pollMs);
  freshTimer = setInterval(() => {
    if (element.isConnected && canFetch() && clock() >= nextExpiry)
      renderMarkers();
  }, 1000);
  function destroy() {
    disposed = true;
    document.removeEventListener("visibilitychange", visible);
    controller?.abort();
    clearInterval(poll);
    clearInterval(freshTimer);
    map?.remove();
    map = null;
    records.clear();
    markers.clear();
    element.remove();
  }
  return {
    ...view,
    get map() {
      return map;
    },
    get selected() {
      return selected;
    },
    get filters() {
      return { ...filters };
    },
    get markerCount() {
      return markers.size;
    },
    get connected() {
      return connected;
    },
    attach,
    refresh,
    select,
    destroy,
  };
}
