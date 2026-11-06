# SendRack presentation — supplied RULED reference

Prepared for visual review before deployment. This changes the existing SendRack marketing presentation; original marketing copy, orange/charcoal/cream identity, waitlist, /app, /admin, tracking, payment callbacks and backend records are preserved.

## References actually inspected

- The user-supplied RULED screenshot: a light product canvas, very large two-tone headline, sparse navigation, detailed blue robot, quiet contextual copy and oversized pale brand lettering.
- User recording `20261106-1900-29.4872529.mp4`, 46.13 seconds, 1398×910 at 30 fps. Its timeline was inspected before motion implementation using sampled frames across the recording and one-second samples of the rotating-line sequence. Approximately 12–20 seconds shows the light hero; roughly 21–42 seconds shows a floating, slowly rotating court plane, a route/line being traced and restrained supporting typography. Earlier/later sections use close product imagery and planning panels.

The supplied screenshot and recording are the primary references. The four earlier Pinterest links were inaccessible and were not used as viewed references. No RULED logo, blue palette, robot model, screenshot or footage is reproduced in the site or published in these review artifacts.

## Adaptation

The existing hero now uses warm light backgrounds, large grey/charcoal/orange type and a detailed SendRack parcel. The parcel was modelled/rendered locally in Blender: bevelled kraft cardboard, fine surface texture, flap seam, continuous orange sealing tape, deterministic wordmark and a sample label/barcode with no real customer data. A single compressed transparent WebP is displayed with a restrained CSS transform and soft CSS grounding shadow. This is a rendered 3D product presentation, not a runtime WebGL viewer.

The existing "One delivery. Everyone in the loop." section gains a lightly tilted route plane connecting Shop → Handoff → Customer, inspired by the reference's drawn-line sequence. It is explicitly labelled illustrative and never represents live GPS or a booked delivery. Supporting content stays beside the visual.

Compact 270px phone frames and the actual sample-data vendor dashboard → create → details → tracking and separate rider journey remain. No oversized screenshot panels return. Full-size links, independent pause/step controls and original service caveats remain.

Motion: parcel 5.8 seconds with a small smooth tilt/float; route-plane angle 14 seconds, line-draw 10 seconds; existing phone tilt 10 seconds and screen changes every six seconds. Parcel and route have independent pause/play controls. Offscreen/hidden-page motion pauses. Reduced motion disables all loops and transitions, shows the complete static route and retains manual phone selection. Mobile uses the same small image and SVG rather than a 3D engine or autoplay video.

## Previews

| View | Hero | Full page | Journey | Phones |
| --- | --- | --- | --- | --- |
| 1366×768 | [Preview](hero-1366.png) | [Page](full-1366.png) | [Journey](journey-1366.png) | [Phones](phones-1366.png) |
| 1920×1080 | [Preview](hero-1920.png) | [Page](full-1920.png) | [Journey](journey-1920.png) | [Phones](phones-1920.png) |
| 390×844 | [Preview](hero-390.png) | [Page](full-390.png) | [Journey](journey-390.png) | [Phones](phones-390.png) |
| 360×800 | [Preview](hero-360.png) | [Page](full-360.png) | [Journey](journey-360.png) | [Phones](phones-360.png) |

[36-second real-browser motion recording](motion.mp4) · [poster](motion-poster.png). It shows the parcel first, then the route plane, then both phone journeys and pause/select controls. The capture is 12 fps at 1366×768 and has no audio. Website motion is CSS rendered by the browser, not this video embedded in the page. Static review screenshots use reduced motion for reproducibility.

## Validation and boundaries

Ten viewport sizes, 320px through 1920px, passed nine animation-phase checks for horizontal overflow and parcel containment. The image loads and original sample phone assets load. New parcel/route pause, offscreen suspension and reduced-motion tests pass. Existing phone autoplay/selection/focus/reduced-motion checks and waitlist submission, owner listing, app navigation/storage, admin and payment-return browser checks pass. Mobile previews use Chromium viewport emulation, not physical iPhone/Android devices.

The map-provider release is independent and merged separately into apk-test-v0.7.0 at `797f83f403e59f198ce14dafdd6c7d36531f0ec2`. This marketing update remains PR #11 for review before deployment. Live Render checks remain blocked by environment networking; no production settings, plans, records, provider keys or signing identities were changed by this design work.

## Reproducible assets

`blender -b -t 4 --python scripts/design/render-marketing-parcel.py` creates the source scene and transparent PNG under artifacts/marketing-parcel (or SENDRACK_DESIGN_OUTPUT). The committed WebP is encoded from that render. No paid image/video generation credits or third-party texture/model assets were used.
