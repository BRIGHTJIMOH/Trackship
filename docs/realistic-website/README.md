# Realistic public website scene

The public hero and delivery journey use an original Three.js parcel model with procedural cardboard grain, rounded edges, seams, printed branding, sealing tape and a shipping label. Environment and directional lights provide material shading and contact shadows. Pointer movement and scrolling adjust the presentation. This is an illustration, not live shipment tracking.

Source: `scripts/design/parcel-scene.mjs`. Run `npm run build:marketing3d` after changing it. Commit the resulting `web/parcel-scene.js`; the existing production install omits development dependencies and does not need a new build step. Three.js and esbuild are pinned development dependencies. The bundle includes the Three.js MIT license.

The module loads after the initial page. Data-saving connections keep the poster. Missing WebGL keeps the poster and SVG route. GPU context loss reveals the poster again. Rendering pauses outside the viewport or when the tab is hidden. Reduced motion disables continuous movement; the route shows its destination. Two renderers share the original model materials, and the journey renderer initializes near its section.

Validation:

- `npm test`: 62 passed; four environment-dependent skips.
- `node tests/marketing-realistic-ui.mjs`: WebGL rendering in Chromium's software GPU at mobile and desktop widths; pause/reduced motion, context-loss and no-WebGL fallback, same-origin assets, role selection and actual local waitlist submission.
- `node tests/marketing-redesign-ui.mjs`: nine viewport sizes, form success/retry, role switching and waitlist-only links.
- `node tests/marketing-parcel-route-ui.mjs`: preserved SVG fallback route alignment and endpoints.

Browser emulation does not establish physical Android/iPhone GPU performance. Live Render verification and deployment are separate from these local checks. No changes to payment, custody, provider credentials or customer records are part of this work.
