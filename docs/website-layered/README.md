# Website animation and layers

Reference: supplied 46.5-second website showcase. Its design progresses from a dark opening with warm edge lighting to white content panels, dark feature cards, a glowing globe, white use-case panels, and a dark closing. It uses compact floating navigation, staggered entrances and layered scroll transitions.

SendRack adaptation: charcoal/orange hero with a glowing circular backdrop behind the existing delivery scooter, floating sticky navigation, staggered hero copy, once-only chapter/card reveals, a small scroll displacement on background layers, and overlapping cream/dark section edges. Existing content, published story players, waitlist consent and API behavior are preserved. No reference video or third-party branding is embedded.

Motion respects the existing Pause motion control and OS reduced-motion preference. Background layers update through a passive scroll listener and requestAnimationFrame; no animation library or remote asset dependency is added. Without JavaScript, content remains visible. Keyboard focus reveals form content immediately.

Validation: public launch checks passed at 320, 360, 390, 430, 750, 768, 1024, 1366 and 1920px; waitlist success/retry and owner records passed. Motion/scroll/sticky navigation/reduced-motion/keyboard browser checks passed. Owner video publication and click-to-load player passed. Four public website/video API tests passed. Screenshots reviewed on desktop/mobile. Production Render deployment is not verified from this workspace.

Only website files changed; no new APK is required. Deploy the merged apk-test-v0.7.0 branch on the existing Render service to publish.
