# Live tracking recommendation

Use rider/carrier phone GPS, the SendRack backend on Render/PostgreSQL and MapTiler for map display. The existing Leaflet interface can display MapTiler tiles; Google Maps billing is not required for this approach. The phone supplies coordinates; a map provider does not locate a parcel by itself.

## How it works

1. The current parcel holder accepts/collects the parcel in their own account.
2. They explicitly start GPS sharing. Android requests location/notification permissions and shows a foreground notification with Stop sharing.
3. The native service requests location updates around every ten seconds/ten metres, subject to Android/provider scheduling. It rejects stale local fixes and uploads only actual positions to the authenticated job endpoint.
4. Customers open the vendor's tracking link in a browser without signup; it polls every five seconds. The app polls delivery changes every ten seconds while open. These are configured refresh intervals, not guarantees of delivery latency.
5. Only the current holder can upload. Custody changes and completion clear the previous position/consent. Public coordinates are reduced to roughly 11-metre precision. A server position older than two minutes is hidden.
6. Network loss, missing permission or stopped GPS must show waiting/unavailable rather than a fabricated moving dot, route, ETA or distance. The delivery history still shows recorded handoffs.

For interstate delivery, the carrier's phone must share during the middle leg, followed by the last-mile rider's phone. The pickup rider's position cannot stand in for a carrier travelling in another state. If carriers cannot run the app, start with honest checkpoint tracking for that leg. For continuous vehicle tracking later, integrate a dedicated vehicle GPS device/platform with explicit carrier consent. An independent tracker is required to locate a parcel after it is separated from the phone/vehicle being tracked.

## Map configuration

`PUBLIC_MAPTILER_KEY` selects MapTiler Streets v2 through `/api/capabilities`. The key is intentionally public and should be restricted by origin/referrer and provider usage limits. The phone app origin is `https://appassets.trackship.ng`; add the hosted tracking origin too. Keep payment and identity secrets out of map settings.

Without a valid map key, the small pilot uses OpenStreetMap's public tiles under their usage policy. Do not assume those public tile servers are an unlimited production map service. Review MapTiler's current plan/terms before using a paid plan or sharing a client demonstration widely. No map account or billable plan has been activated here.

## Physical delivery test still needed

Use at least two real Android phones and a separate customer browser. Test fresh fixes, backgrounding/screen lock, battery restrictions, permission denial, internet loss/recovery, Stop sharing, stale data after two minutes, handoffs across all legs and delivery completion. Emulator/browser test coordinates are not proof of an actual journey or background-device reliability. The phone needs location services, suitable permission, mobile internet and battery power.
