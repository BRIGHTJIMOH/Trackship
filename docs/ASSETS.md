# Visual assets

The orange/white palette, rounded cards, pill navigation, shipment summary, timeline, stepped package flow, monochrome onboarding and typography follow the UI references supplied by the user. App branding remains SendRack rather than the reference product's name.

- `web/assets/courier-photo.png`: original AI-generated onboarding photograph made for this app, 3 November 2026. No external person identity or product branding was requested.
- `web/assets/courier.svg` and `route.svg`: original vector assets created for this app.
- Poppins Regular, Medium and SemiBold: bundled from Google Fonts' `ofl/poppins` distribution, licensed under the SIL Open Font License. The complete license is retained as `web/assets/OFL.txt`.
- UI icons are local SVG path drawings. No runtime font, photo or icon CDN request is needed.

The route map is an original schematic, clearly labelled in the app as an illustration. It is not a GPS trace, measured route or live rider location.

Version 0.3.0 adds Leaflet 1.9.4 (BSD-2-Clause; license in `web/assets/LEAFLET-LICENSE.txt`) and real OpenStreetMap map tiles with visible attribution. The old route illustration is retained as an onboarding asset only; it is no longer used to represent a live rider location. Test map screenshots may show blocked tiles and an explicitly test-injected browser coordinate.

Version 0.3.1 switches the visible app typography to the bundled Inter variable font from Google Fonts (`ofl/inter`), licensed under the SIL Open Font License retained as `web/assets/INTER-OFL.txt`. Previous Poppins files remain for release history but are no longer used by the app stylesheet.

## SendRack split-S mark

The original geometric mark in `web/assets/sendrack-mark.svg` is built from two curved route ribbons with a diagonal gap, using #FF6B00. The SVG path geometry is reproduced in the app wordmark and Android vector drawables. White and orange marks and the app-icon SVG are exported in `downloads/SendRack-logo/`. Raster AI concepts were explored separately; the production assets are flat vectors with no glow or gradients.
