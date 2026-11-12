# Google routing: preparation, not an activated feature

Google project and billing are not yet configured. No Google APIs, paid resources or new pricing rules are enabled by this change.

## Product flow

- Intrastate: an accepted rider may explicitly share an approach location while travelling to pickup. Show road distance and an estimated pickup time from that fresh fix to the confirmed vendor pickup pin. After collection, show the remaining delivery leg to the confirmed recipient pin.
- Interstate: vendor pickup pin -> configured origin park -> configured destination park -> recipient pin. Park endpoints must be actual verified locations, not state centroids. Include carrier departure and transfer waits in an overall estimate; if those are unknown, show travel time only and explain that an overall ETA is unavailable.
- Offer selection and custody acceptance remain distinct. Approach sharing never changes custody, uploads the viewer's location, or releases money. Stop tracking at completion/cancellation, logout, reassignment or revocation.
- Keep customer UI concise: distance, estimated time/range, update freshness, current delivery stage. Admin diagnostics remain separate. Stale GPS cannot produce a live approach/arrival claim. A route-service outage does not reset maps, forms or custody.

## Existing-code gaps

The route catalog currently stores origin/destination cities and states, not park coordinates. Shipments need confirmed destination pins; the existing sender-confirmed pickup pin is separate from rider GPS. Current holder sharing is custody-gated, so pre-pickup approach sharing requires a distinct authenticated, assignment-bound consent and endpoint.

## Integration sequence

1. Confirm Google project/billing readiness; inspect current pricing and regional route/mode coverage before enabling any paid traffic. Set API quotas and budget alerts (alerts are not hard spending caps). Do not enable extra products without need.
2. Confirm the Google rendering/routing architecture and its current display/attribution/caching terms. Restrict browser keys to actual origins and Android keys to the matching package/signing certificate. Keep server credentials private; do not commit keys or paste them into chat.
3. Add verified park coordinates to admin routes and recipient-pin confirmation during shipment creation. Preserve legacy routes/shipments without inventing coordinates.
4. Implement provider-backed routes on the server behind authorization, concurrency limits, request deduplication and configurable refresh limits. Do not calculate a traffic ETA from a straight-line distance. Vehicle mode availability must be confirmed for Nigeria; never silently represent a car estimate as motorcycle routing.
5. Add explicit rider approach consent after assignment; restrict vendor access to their own shipment. Expose only suitable data on public tracking; never disclose an unassigned rider's location. Use Google route results only in ways allowed by Google's current terms.
6. Render per-leg distance/time and realistic overall estimates. Test missing endpoints, rejected keys, no route, service outage, stale GPS, reassignment, handovers, terminal states, permissions and independent viewer location. Verify real provider calls only after configured account and network access are available.

## Pricing recommendation for discussion

Begin with admin-set vehicle/zone or route rates, clearly quoted before vendor confirmation and rider acceptance. Interstate pricing should separately identify pickup, carrier and last-mile amounts. Distance/time estimates do not automatically change charges or existing holds. Customer offers/counteroffers would need a separate optional workflow with a minimum rate, expiry and final agreed quote before a wallet hold. No changes to charges or wallet operations are included here.
