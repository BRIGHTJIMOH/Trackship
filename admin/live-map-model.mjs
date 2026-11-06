export const stageColors = {
  waiting: "#d97706",
  assigned: "#0891b2",
  pickup: "#2563eb",
  carrier: "#7c3aed",
  lastmile: "#15803d",
  incident: "#dc2626",
  stale: "#6b7280",
  mixed: "#334155",
};
export function gpsState(record, now) {
  return record.gps?.state === "fresh" &&
    Number.isFinite(record.gps.freshUntil) &&
    record.gps.freshUntil > now
    ? "fresh"
    : record.gps?.position
      ? "stale"
      : "unavailable";
}
export function matchesOperations(record, filters) {
  const query = (filters.search || "").trim().toLowerCase();
  return (
    (!filters.state ||
      [record.originState, record.destinationState].includes(filters.state)) &&
    (!filters.city ||
      [record.origin, record.destination].includes(filters.city)) &&
    (!filters.route ||
      record.routeId === filters.route ||
      record.routeName === filters.route) &&
    (!filters.status || record.status === filters.status) &&
    (!filters.type || record.deliveryType === filters.type) &&
    (!query ||
      [
        record.code,
        record.id,
        record.routeName,
        record.origin,
        record.destination,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query))
  );
}
function near(a, b) {
  const lat = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  return (
    Math.hypot(
      (a.lat - b.lat) * 111320,
      (a.lng - b.lng) * 111320 * Math.cos(lat),
    ) <= 75
  );
}
export function carrierGroups(records, { now, showStale = false } = {}) {
  const groups = [],
    holders = new Map();
  for (const record of [...records].sort((a, b) =>
    String(b.gps.receivedAt).localeCompare(String(a.gps.receivedAt)),
  )) {
    const freshness = gpsState(record, now);
    if (freshness === "unavailable" || (freshness === "stale" && !showStale))
      continue;
    const point = record.gps.position;
    const key =
      record.custodian === "carrier" && record.holderKey
        ? record.holderKey + ":" + freshness
        : null;
    let group = key
      ? holders.get(key)?.find((g) => near(g.point, point))
      : null;
    if (group) {
      group.records.push(record);
      continue;
    }
    group = {
      id: record.id,
      point,
      freshness,
      stage: record.stage,
      carrier: key !== null,
      records: [record],
    };
    groups.push(group);
    if (key) {
      const entries = holders.get(key) || [];
      entries.push(group);
      holders.set(key, entries);
    }
  }
  return groups;
}
// Screen-space grid clustering bounds DOM markers while preserving individual shipment selection.
export function clusterGroups(groups, project, cellSize = 54) {
  const cells = new Map();
  for (const group of groups) {
    const p = project(group.point),
      key = [
        Math.floor(p.x / cellSize),
        Math.floor(p.y / cellSize),
        group.freshness,
      ].join(":");
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        key,
        groups: [],
        records: [],
        x: 0,
        y: 0,
        freshness: group.freshness,
      };
      cells.set(key, cell);
    }
    cell.groups.push(group);
    cell.records.push(...group.records);
    cell.x += p.x;
    cell.y += p.y;
  }
  return [...cells.values()].map((c) => ({
    ...c,
    x: c.x / c.groups.length,
    y: c.y / c.groups.length,
    stage: c.groups.every((g) => g.stage === c.groups[0].stage)
      ? c.groups[0].stage
      : "mixed",
  }));
}
