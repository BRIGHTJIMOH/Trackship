# Admin overview map layout

The live operations map appears before Overview analytics. It spans the content width, with shipment details below. Height adapts to the viewport (480–820px desktop; 360–560px mobile). ResizeObserver invalidates the Leaflet viewport when its container changes size and disconnects on disposal. Existing map provider configuration and live GPS eligibility rules remain unchanged.

Validation: syntax and whitespace checks passed. Browser layout checks passed at 390, 768, 1440 and 1920px, with map-first ordering, full content width and no horizontal overflow. Existing live-map UI regression passed with 2,000 synthetic shipments / 60 carriers, preserving filters, zoom and selection through refresh and connection failures. Tiles were mocked; this does not verify production tile service availability or real device GPS.

APK build20 exists unsigned in artifacts. The retained signing directory /workspace/sendrack-test-signing is absent in this workspace; no replacement identity was generated. The build cannot be published as installable until the retained private signing files are available.
