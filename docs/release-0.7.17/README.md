# SendRack 0.7.17-fcm (version code 17)

Vendor route selection stays visible when a remembered account has no active online session. The public configured route list and quote API use the configured service origin, routes refresh when opening the shipment form, and loading/error/empty states provide a retry. Retrying replaces only the route controls and preserves entered delivery details. Server prices and configured-route validation remain authoritative.

Vendor sync applies owner-authorized test-removal markers before processing other records, checks completed records as well, and continues after individual record failures. Missing snapshot rows alone never delete local records. Offline/expired sessions show Sign in to sync rather than silently implying current records. Real pending work stays on Home regardless of age. No deletion bypass or new public access to shipment details.

Home banner uses the existing truck, Keke, dispatch rider and car assets, with the heading above four separate vehicle slots on a shared baseline and the truck largest. Image bounds do not overlap. Narrow phone layouts retain readable text and separate artwork.

Install downloads/SendRack-0.7.17-fcm.apk over ng.sendrack.test without uninstalling or clearing storage. Existing signing identity retained: SHA256 d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5. Firebase project, payment/OTP rules, and test dispatch controls unchanged. No schema, secrets, hosting-plan or provider configuration changes.

Checks: extracted APK browser tests cover route selection without a session, failed route request/retry with form values preserved, deletion sync despite an older invalid record, old pending work retained, expired-session prompt/recovery, History and existing vendor/rider pickup/call/collection journeys. Banner checked at 320/390/760 pixels; exact APK assets, Firebase package and retained signing certificate verified. Screenshots use sample data. Live Render availability and physical Android execution are not verified by these checks.
