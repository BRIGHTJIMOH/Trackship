# Home layout — 0.7.32

Applies to both vendor and rider Home. The wallet's left content can shrink/wrap; money actions wrap their labels instead of clipping. At narrow viewport widths the actions move beneath the balance. Quick-action columns can shrink within their container. Normal-width Home retains its existing layout. Android text zoom/accessibility is preserved.

App routes use manual browser scroll restoration, while public tracking and dispatch links keep their existing behavior. Existing per-screen scroll preservation remains; browser scroll anchoring cannot move the Home shell during a redraw. Browser safe-area variables and the Android outer-frame insets remain unchanged.

Regression evidence: the previous CSS failed wallet button text containment at 280px/160% text (Add money); updated CSS passed for both roles at 280, 320, 360, 390, 412, 480, 768 and 844px, including short/landscape viewports, simulated large text, wallet text/control containment, safe-area spacing and navigation/reload scroll reset. Exact physical-phone top clipping cannot be reproduced from the available information. Browser simulations do not prove every device/OS configuration.

Install signed APK 0.7.32 over the existing test app. Existing signing certificate retained. No server behavior or production feature switch values changed. The backend branch can be deployed normally for browser app users. Physical Android execution/FCM receipt and live Render deployment are not verified in this workspace.

The complete extracted-APK browser suite passed, including account and notification tap login, viewer/map assets, two-session shipment creation and acceptance, collection, quiet updates and pickup confirmation. These checks use controlled APIs/native bridge callbacks.
