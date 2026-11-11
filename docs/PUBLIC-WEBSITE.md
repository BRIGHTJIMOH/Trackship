# SendRack public launch website

A replacement public website built from new HTML, CSS and JavaScript, using the supplied product-site references for its framed white composition, oversized product artwork and typography.

- Entry: `web/marketing.html`, `web/marketing.css`, `web/marketing.js`.
- Original generated studio artwork: `web/assets/sendrack-studio-scooter.webp`. It is a rendered image with subtle pointer parallax, not a real-time 3D model or recorded video. Reduced-motion preferences disable the parallax.
- The previous parcel renderer, Three.js/esbuild dependencies, model sources, old marketing art and retired design-specific tests/previews have been removed.
- All public signup links lead to `#waitlist`. The application is not advertised as available. The existing waitlist API and owner listing provide persistent signup storage.
- App/admin, tracking and payment-return routes retain their existing contracts.

Validation: `npm test` (62 passing, four environment-dependent skips); `node tests/public-launch-ui.mjs` (nine widths, artwork loading, rider preselection, motion controls, error recovery, real local signup and owner listing). Browser viewport tests are not physical-device testing.

No production deployment is part of preparing this preview. Source is buildless and uses the existing Render service; no hosting migration or new resource is required.
