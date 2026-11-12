process.env.SENDRACK_TEST_APK ||= 'artifacts/SendRack-0.7.16-fcm.apk';
await import('./app-corrections-ui.mjs');
await import('./viewer-apk-assets.mjs');
await import('./mobile-map-origin-ui.mjs');
await import('./two-device-dispatch-ui.mjs');
await import('./dispatch-quiet-ui.mjs');
await import('./pickup-view-ui.mjs');
console.log('Signed APK assets passed in Chromium against isolated local APIs. Android OS/device execution and live Render access were not tested.');
