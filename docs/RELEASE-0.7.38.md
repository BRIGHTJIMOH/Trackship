# SendRack 0.7.38 — signup recovery and private console files

Browser signup now verifies email before private document upload and resumes at identity or PIN setup after a page reload. Android keeps its encrypted document-vault flow and saves signup progress until account entry succeeds. Failed uploads remain retryable. Test-sender configuration errors are logged safely and shown in owner readiness; customers receive a plain-language error. Sending signup emails to general users still requires a verified Resend sender domain and an appropriate private key in Render.

The owner console now includes File library: nested folders, private existing asset links, uploads to private S3/R2 storage, confirmed file listings and attachment downloads. New uploads are disabled until storage is connected. No local production disk fallback is used. Regional and mobile accounts are denied; mutations require the existing owner CSRF protection.

Validation: all 117 regression tests passed against isolated PostgreSQL; dedicated library browser tests and vendor/rider browser and Android-bridge signup recovery tests passed. The signed APK uses the retained signing identity and increased version code. Physical iPhone/Android execution, live email delivery, actual R2/S3 credentials and live Render deployment are separate checks.

Setup: [Resend and signup recovery](SIGNUP-EMAIL-RECOVERY.md), [file storage](file-library/SETUP.md). Deploy the release to the existing Render source branch `apk-test-v0.7.0`; preserve the database, encryption keys, account credentials and payment configuration. No iOS wrapper changes are included in this release.
