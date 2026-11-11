# SendRack 0.7.5

Signed update for the previous SendRack Test installation: visible name SendRack, versionCode 5, unchanged ng.sendrack.test application ID and retained signing certificate. No uninstall is needed. Original ng.trackship.app signing identity remains untouched; installation-only records do not transfer automatically.

Source: 02f723374826f179176b8e860cfd8a94e5c7295c
APK SHA-256: c708e92e1b3ea5d5e0626baacc210fe23ad22e067de2898f77272287463b0227
Backend: https://sendrack-api.onrender.com

Includes compact grouped profile screens, explicit readable night-mode banner/card colours, and custody progress with green completed / orange current / muted upcoming stages. Acceptance and physical collection remain distinct. Completed deliveries are green and end the animation; reduced motion is supported.

Fixes the no-cloud-session Android map configuration request: use the configured backend instead of the local asset host. Keeps map viewport on provider refresh, refreshes mobile sizing, aligns selected delivery actions and suppresses ended-delivery holder GPS. MapTiler restrictions remain enabled and need to permit the actual app origin https://appassets.trackship.ng as well as the web origin. No Referer spoofing or automatic provider bypass. Removing PUBLIC_MAPTILER_KEY explicitly selects the existing OpenStreetMap pilot.

68 application tests, owner browser flows, profile/night-mode/contrast/packaged APK UI, all custody stages and controlled map tests passed. APK v2/v3 signature and source hashes verified. Real Render/MapTiler access was blocked by the environment CONNECT 403; no live provider success or physical Android execution is claimed. Mock bank features remain non-production. Existing database records, Render resources/settings/free plans and signing keys were preserved.

Screenshots/gallery: SendRack-profile-tracking-previews-0.7.5.zip (unzip and open index.html). Sample accounts and sample money only; unavailable map tiles are reported truthfully.
