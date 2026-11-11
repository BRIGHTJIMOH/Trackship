# Integrated app corrections

The wallet is now a view in the existing SendRack /app shell, not another app,
APK, popup or separate login. /app/wallet bookmarks redirect into /app#wallet.
The old standalone customer wallet page/scripts have been removed. Customer API
projections return only name, available balance and simple activity, without raw
ledger records, bank/ledger/held balance comparisons, references or custody fees.
Accounting detail remains in the role-restricted admin workspace.

Wallet shows name, balance, Add money, Withdraw and ordinary activity. Transaction
PIN enrollment is under Profile -> Security. Withdraw opens its own short flow
only on tap; user labels say Withdraw and Processing, never admin approval terms.
PIN, OTP, server limits, independent approvals where required, reservation and
bank confirmation remain enforced behind the interface. Mock sample balances are
labelled as samples; production does not activate a mock provider or invent funds.

The account screen is simpler: remembered nickname/initials and masked phone,
app PIN and login, with Switch account and Sign up. Signup asks Vendor or Rider
after Sign up is selected. Verified email/code login remains available. Existing
saved accounts and PIN hashes are retained; login verification is never bypassed.

Riders can choose Tricycle / Keke NAPEP. Signup uses city and state for city-wide
coverage; community is no longer required. One government-ID selection, one number
and one ID photo replace duplicate NIN/driving-licence/registration fields. National
ID numbers still require 11 digits. ID photo, consent, address and rider emergency
contact checks remain; submissions stay pending review. Existing encrypted records
are not migrated, deleted or automatically approved. New and v4 submission APIs
accept this simpler government-ID model; older v3 payloads remain compatible.

Shipment creation has package -> delivery -> review. Removed declared value,
special instructions, artificial service choices, manual agreed fees, manual rider
assignment, payer-email/payment forms and private dispatch-link panel clutter.
Users select a server-priced route; existing percentage and flat pricing remain
admin controlled. Existing payment APIs/callbacks and saved delivery records are
preserved for compatibility. When bank funding is not connected, the app clearly
shows pending setup rather than pretending to deduct money or dispatch a parcel.

Verification: 66 app tests and 35 wallet/finance tests passed on local PostgreSQL,
including city/ID/account privacy changes. tests/app-corrections-ui.mjs runs the
actual app in Chromium at mobile and desktop widths: remembered login, in-shell
wallet, Profile PIN, tapped withdrawal/OTP, ordinary Processing activity, server
route review and saved shipment detail, Keke signup, one-ID upload and photo-file
retention. Synthetic screenshots are in previews/. The existing finance UI checks
also preserve drafts/focus/scroll/dialogs across refresh/failure.

No Render resources/plans/settings, existing database rows or app signing key were
changed. This web/backend update does not change already-installed APK assets; an
APK UI update requires a properly signed app update. The Android source/build asset
allowlists include the new modules without changing application ID/signing identity.
Physical-device and live Render verification have not been performed in this task.

## Vehicle-based home and matching

The vendor home now follows the supplied visual reference: greeting/avatar, compact
balance, a parcel-movement banner, and four pastel service cards (Keke, Car,
Dispatch bike, Truck/Movers). Each card uses a generated miniature 3D illustration;
these are original generated assets rather than copied third-party photographs.
The four transparent WebP files total about 117 KB at 480px, and are explicitly
allowlisted for both hosted serving and Android packaged assets/MIME types.

A card opens the existing shipment form with its pickup vehicle selected. The class
persists in the saved shipment and server payload. Registered pickup-area riders
are filtered by the exact selected vehicle class before notification or offer
listing. Private pickup links cannot bypass that class/capacity check. Truck means
a registered Truck; Van and Bicycle profiles keep legacy unselected-vehicle offers
but are not silently treated as trucks or motorcycles. Interstate carrier/last-mile
handoffs keep their independent custody legs; the requested class governs pickup.

Optional parcel weight and rider-declared load capacity use exact integer grams.
When a parcel weight is specified, missing or insufficient declared capacity is
ineligible. No per-vehicle capacity numbers or vehicle price premiums were invented.
The registered value is a declaration, not a claim of external capacity certification.
Existing server route pricing remains authoritative. Jobs with no requested class
or weight keep their original matching behaviour and saved records are not migrated.

The updated suite passes 68 app tests (including matching notification, wrong-class
private-link rejection and exact-weight handling) and 35 wallet/finance tests.
Browser checks verify the four images load and Keke selection survives the normal
package -> delivery -> review flow, alongside the account/wallet corrections above.

Final minimal-home refinement: vendor home ends after the four vehicle cards.
Search is an icon beside notifications and opens the Packages search. Empty-state
shipment cards, inline search/filter bars, pickup shortcuts and extra sections are
removed from Home; packages and tracking remain in their existing screens. The +
button still creates a shipment. This layout and header search are browser-tested.
The latest interactive 3D marketing website and its esbuild/three dependencies from
the deployment branch were retained when resolving package manifest/lock conflicts.
