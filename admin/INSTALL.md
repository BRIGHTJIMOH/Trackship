# Install SendRack Admin

This build adds a standalone, installable web app for the existing owner console.
It is not an APK or an App Store submission. One deployment serves tablets and
computers, and updates are delivered from the same server.

Use a normal browser window; Chrome does not offer installation in Incognito.

After this source has been deployed over HTTPS:

1. Open https://sendrack-api.onrender.com/admin/ on the device.
2. Select **Install console**. Where a native install prompt is available, confirm it.
3. Otherwise follow the instructions shown:
   - Android tablet: Chrome menu → Install app / Add to Home screen.
   - Windows or Mac: Chrome or Edge install icon / menu → Install this page as an app.
   - Supported Mac Safari: File → Add to Dock.
   - iPad: Safari → Share → Add to Home Screen; enable Open as Web App if offered.
4. Launch **SendRack Admin** from its new icon and sign in with existing admin credentials.

The first installation uses the browser. Subsequent launches use the app icon and
standalone window. Browser/OS support controls which install options are available.
A new installation may require a fresh sign-in. There is no embedded admin password.
The manifest covers `/admin/` and the finance page at `/admin/wallet`. The legacy
`/admin` URL also offers installation; the installed app starts at `/admin/`.

Live records, uploads and downloads require connectivity. The service worker stores
only `/admin/offline.html`, a generic reconnect page. It never stores API results,
shipments, file downloads or authenticated page content in Cache Storage. It does
not handle `/api/`, customer app pages, mutations or external requests. It does not
add background push notifications or offline editing.

Verification: `npm run test:admin-pwa` exercises the manifest, PNG routes, worker,
tablet layout, session persistence, offline reconnect and logout enforcement using
local Chromium. Test on actual target tablets/computers before distributing widely.

Deployment uses the normal server release; no database migration, new credential
or storage provider is needed. Rollback consists of reverting these source changes;
previous workers are network-only except for the harmless reconnect document.
