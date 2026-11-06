# Compact existing website: before / after

Adjusts the existing marketing page, without replacing its branding, content sections, backend, phone screenshots, animation logic or waitlist. Prepared for review before deployment.

| Desktop viewport | Before | After |
| --- | --- | --- |
| 1366×768 | [Product section](before-product-1366.png) / [viewport](before-viewport-1366.png) | [Product section](after-product-1366.png) / [viewport](after-viewport-1366.png) |
| 1920×1080 | [Product section](before-product-1920.png) / [viewport](before-viewport-1920.png) | [Product section](after-product-1920.png) / [viewport](after-viewport-1920.png) |

[28-second actual-browser animation recording at 1366×768](animation.mp4) · [poster](animation-poster.png). Shows gentle tilt, screen transitions and pause/select controls. No audio.

Before captures serve the HTML and CSS from commit `ed9a2dd65d5ba0e251b56c75e47196791ecdf144` with the same local server, assets and viewport as after captures. Static screenshots use reduced motion for reproducible comparisons; the recording uses normal motion.

Desktop phones are 270px wide, reduced from 326px, with proportional frames/screens. Large surrounding panels are removed. Feature text and controls sit beside the phones, vertically grouped rather than stretched over their height. Product-section padding and heading gap are smaller. Narrow screens stack each journey and shrink the phone to available width (256px at a 320px viewport). No page overflow is hidden to achieve containment.

The desktop product section decreased from 1468px to 873px (about 40%). See [measured dimensions](measurements.json). Phone screens remain readable through pause/step controls and full-size image links. Existing six-second transitions, gentle tilt, reduced-motion behavior and offscreen suspension remain.

Validation: both requested desktop dimensions, tablet and 390/320px mobile comparisons; all 10 existing responsive layout sizes pass nine animation-phase overflow/parcel-containment checks. Journey checks pass autoplay, pause, selection/focus, full-size links and reduced motion. Browser integration checks pass waitlist submission/owner listing, preserved local storage through /app navigation, /admin login and payment-return navigation. These are local Chromium tests, including mobile viewport emulation, not physical-device or live Render verification. Only marketing HTML/CSS and review/test artifacts change in this adjustment.

All four supplied Pinterest links were retried and returned inaccessible errors. **None was viewed**:

- https://pin.it/7xQJYimlm
- https://pin.it/3CipoBwfi
- https://pin.it/7yWO5wxEN
- https://pin.it/3MyjlVjeC

No deployment, Render plan/resource/configuration changes, or database changes were performed. PR #11 remains the prepared deployment update for `apk-test-v0.7.0`.
