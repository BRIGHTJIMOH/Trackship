# Retained-identity signed APK

Built directly from apk-test-v0.7.0 commit 2cecea208c88d979bc728210f1e71e0baa66484a using scripts/build-firebase-apk.sh. No application source changes.

Package: ng.sendrack.test. Version: 0.7.20-fcm; version code: 20.

Existing signing identity was supplied privately from /workspace/sendrack-test-signing. No key was generated or replaced. The retained certificate file and final APK signer both match SHA-256 d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5.

APK SHA-256: 1d481d0e7fbcfb6aa51c971aa58438786aac049dc2bd6c7f69ac010de475d9a1.

Verification: successful Android release build; apksigner signature verification; matching package/version and Firebase configuration; exact packaged source for all 15 top-level web assets and native entry aliases. No raw signing inputs or Firebase JSON packaged. This build does not claim physical-device execution or live provider tests.

Install over the existing SendRack test app without uninstalling or clearing data. Artifact published separately from deployment branches; no backend rollout requested or performed by this artifact publication.
