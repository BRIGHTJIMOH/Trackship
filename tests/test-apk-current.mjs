process.env.SENDRACK_TEST_APK ||= 'artifacts/SendRack-Test-0.7.3-test.1.apk';
await import('./app-corrections-ui.mjs');
await import('./viewer-apk-assets.mjs');
console.log('Signed APK assets passed in Chromium against isolated local APIs. Android OS/device execution and live Render access were not tested.');
