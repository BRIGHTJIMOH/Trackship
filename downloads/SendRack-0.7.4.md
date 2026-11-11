# SendRack 0.7.4

Visible app branding is SendRack. VersionCode 4; application ID ng.sendrack.test and retained signing certificate are unchanged. This updates the previous SendRack Test installation without uninstalling. Original ng.trackship.app identity remains untouched; its device-only records do not automatically transfer.

APK SHA-256: f81e3b1093e3418dd8ab7758b3dc483692e9e9a8a6cd86fd5f06cd6918ad24cf
Source: f16376a204e61010eb9a951837c493512eb1c423
Backend: https://sendrack-api.onrender.com

Includes centred login, Login PIN wording, larger rotating standalone splash logo with reduced-motion support, searchable provider-backed bank picker and account lookup/retry. Live bank integration remains unavailable: sample directory/account names are explicitly labelled in isolated mock mode and mock money APIs refuse production. Existing PIN, OTP, KYC and approval safeguards remain.

68 app tests, 35 wallet tests, Chromium UI and extracted-APK tests pass. Signature v2/v3 verifies. No physical Android device or emulator was available. Render rollout and actual map tiles could not be verified under network restrictions. No Render plans, settings or existing database records were changed.

Open index.html in SendRack-rider-previews-0.7.4.zip for the full sample-data gallery.
