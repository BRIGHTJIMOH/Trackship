export const DISPATCH_FLOW = {
  intrastate: [
    "Shipment created",
    "Rider assigned",
    "Rider travelling to pickup",
    "Rider arrived",
    "Parcel collected",
    "Out for delivery",
    "Delivered",
  ],
  interstate: [
    "Shipment created",
    "Rider assigned",
    "Rider travelling to pickup",
    "Rider arrived",
    "Parcel collected",
    "Carrier received parcel",
    "In transit",
    "Carrier arrived",
    "Last-mile rider received parcel",
    "Out for delivery",
    "Delivered",
  ],
};
export function dispatchPublic(s, now = Date.now()) {
  if (
    s.workflowVersion !== 5 ||
    s.tracking?.revoked ||
    (s.tracking?.expiresAt && s.tracking.expiresAt <= now) ||
    s.status === "Cancelled"
  )
    return null;
  const location =
    s.locationConsent &&
    s.location &&
    s.location.leg === s.custodian &&
    now >= Date.parse(s.location.at) &&
    now - Date.parse(s.location.at) < 120000 &&
    !s.incidentOpen &&
    s.status !== "Delivered"
      ? {
          lat: Math.round(s.location.lat * 10000) / 10000,
          lng: Math.round(s.location.lng * 10000) / 10000,
          accuracy: s.location.accuracy,
          at: s.location.at,
          leg: s.location.leg,
        }
      : null;
  return {
    code: s.code,
    business: s.business,
    description: s.description,
    origin: s.origin,
    destination: s.destination,
    originState: s.originState,
    destinationState: s.destinationState,
    deliveryType: s.deliveryType,
    workflowVersion: 5,
    status: s.status,
    custodian: s.custodian,
    createdAt: s.createdAt,
    flow: DISPATCH_FLOW[s.deliveryType],
    locationSharing: Boolean(location),
    location,
    contactVerified: Boolean(s.recipientVerifiedAt),
    deliveryCodeStatus: s.deliveryCodeStatus || null,
    events: s.events.map((e) => ({
      id: e.id,
      status: e.status,
      at: e.at,
      leg: e.leg,
      actorName:
        e.leg === "vendor"
          ? s.business
          : e.leg === "customer"
            ? "Customer"
            : "Delivery handler",
    })),
  };
}
export function distanceKm(a, b) {
  const rad = (n) => (n * Math.PI) / 180,
    dLat = rad(b.lat - a.lat),
    dLng = rad(b.lng - a.lng),
    x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
