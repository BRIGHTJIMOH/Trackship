process.env.SENDRACK_TEST_APK ||= 'artifacts/SendRack-0.7.7-fcm.apk';
await import('./app-corrections-ui.mjs');
await import('./viewer-apk-assets.mjs');
await import('./mobile-map-origin-ui.mjs');
console.log('Signed APK assets passed in Chromium against isolated local APIs. Android OS/device execution and live Render access were not tested.');
