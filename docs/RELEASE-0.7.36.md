# SendRack 0.7.36-fcm — Android blank startup correction

Cause: version 0.7.35 packaged delivery-cards.mjs and imported it from the entry module, but Android's LocalAssetPolicy did not allow that exact path. The WebView returned 404 for the import, so app initialization never ran and the empty app container stayed blank. Earlier extracted-asset browser tests did not enforce the native allowlist.

Correction: explicitly allow /delivery-cards.mjs; retain exact-path blocking for all unlisted assets and traversal paths. Existing app origin, package identity, signing identity, local storage and identity vault are preserved. No uninstall/data reset is required.

Prevention: both APK build scripts now run a startup dependency graph check before building. The APK startup test compiles and executes the Java asset policy, enforces that policy and the Android CSP in a browser, verifies compiled DEX includes all required module paths, and tests startup with external network access blocked. The old 0.7.35 APK reproduces a blank screen under the old policy; the corrected package must render login.

Limits: this verifies native policy plus packaged browser execution, not a physical Android WebView/emulator run. A real-phone install/update confirmation is still needed.
