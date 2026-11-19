# SendRack 0.7.35-fcm — information cards

- Home shipment cards show a three-part view of recorded custody: pickup, journey and delivery. The full tracking history remains available. Rider acceptance is not shown as parcel collection, and an OTP request is not shown as delivery completion.
- Send again opens the existing shipment form with the previous recipient/address selected immediately. Package details, quote confirmation and a new shipment reference are still required.
- The completion card counts confirmed delivered shipments present in the account's delivery book. It does not award discounts, promise free deliveries or claim a lifetime server total.
- No invented ETA, arrival countdown, reward points, new API polling, voice feature or backend workflow changes.
- Cards use forest green, sage and cream, support dark mode and reflow on narrow phones. Existing signup/session protections are retained.

Verification: card-state tests; existing vendor/rider UI workflows; saved-detail selection; compact unsent cards; responsive Home and larger text simulation. Signed Firebase test package uses the retained signing identity. Physical-phone verification remains necessary.

The separate architecture audit documents scaling limitations and proposed fixes. This cosmetic/navigation release does not resolve the global write lock, full-table scans or production infrastructure sizing; it is not a two-million-user readiness release.
