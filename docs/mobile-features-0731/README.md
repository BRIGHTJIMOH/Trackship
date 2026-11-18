# Mobile feature switches — 0.7.31

Owner console → Mobile features → switch Bulk shipments and/or Receive parcel on. Each switch saves automatically; there is no separate Save button. Both default off and no production setting is changed by this release. Regional managers cannot change these global settings. Changes use CSRF protection, revision conflicts and an audit record.

Install APK 0.7.31 once. Enabled features appear as round shortcuts on vendor Home within 30 seconds while open, or on return/login; six shortcuts use two rows. Previous APKs do not contain these feature screens/switch integration. The backend must also be deployed. Settings persist in the database. No new APK is needed for subsequent on/off changes.

Bulk: individual entry with a saved basket or CSV; each parcel has its own quote/reference/custody/payment, with explicit consent. Existing account-scoped saved baskets are retained. Normal single entry does not accidentally publish a basket. Existing payment gates remain.

Receive: uses the current signed-in vendor/customer workspace (no new account role). Requester supplies the external sender's name, Nigerian phone and pickup address, plus the recipient/delivery address. Requester details prefill recipient. Standard route pricing, payment, rider matching, physical collection and OTP delivery still apply. Assigned pickup rider sees the sender contact; recipient becomes primary after collection. Public tracking excludes phone/address details.

Turning off removes shortcuts and rejects new typed bulk/receive requests on the backend. Existing shipments, assigned jobs, idempotent retries, custody and delivery continue. Current drafts are not deleted. Activation does not send promotional push messages.

Validation: 111 server tests passed, including owner/CSRF/revision/regional boundaries, disabled creation, enabled receive/bulk, idempotent retry after disable, sender/recipient contact progression and public contact privacy. Mobile browser test passes admin activation, six round shortcuts without overflow, real receive creation, two distinct bulk entries, logout/reopen and disable with existing shipments preserved. Signed APK retains existing certificate. Physical-device execution/FCM receipt and live Render deployment are not verified here.

The complete extracted-APK browser suite also passed: owner/regional console paths, shipment retry, secure login/notification taps, compiled notification bridge and asset checks, maps, two-session create/accept/collect, quiet refresh and pickup confirmation. These remain controlled browser/native-bridge tests, not a claim of live phone notification receipt.

Admin card refinement: separate explanatory cards, accessible independent On/Off switches, Visible/Hidden shortcut placement and a saved confirmation explaining when the app updates. Failed saves revert the switch and show an error. Mobile/desktop browser checks passed, including a controlled save failure with the other feature preserved and real mobile propagation. No new APK required for this console-only refinement.
