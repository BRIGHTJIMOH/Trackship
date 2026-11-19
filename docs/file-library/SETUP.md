# Owner file library

Open `/admin`, sign in as the owner and choose **File library**. Default folders are APKs, Mockups, Brand assets, Documents, Photos and Videos. Owners can create nested folders and download or remove files. Regional managers and mobile accounts cannot access the library.

Existing SendRack assets link to the already-private download site. These files have not been copied to object storage. The download site can require a separate ChatGPT owner sign-in. Removing a starter link removes only the console listing. Do not add financial or research files to the public source repository.

New uploads stay disabled until private object storage is configured. There is no local-disk fallback. Folder and file metadata live in the existing database. File bytes travel directly to private object storage. Downloads use 60-second signed URLs and attachment disposition. Uploads become visible only after a server-side size check.

## Cloudflare R2

1. In your Cloudflare account, open **R2 Object Storage** and create a private bucket, for example `sendrack-assets`. Keep public access disabled.
2. Create an R2 S3 API credential with object read/write permissions restricted to this bucket. Keep its values private in Render's environment settings.
3. Set these variables on the existing `sendrack-api` Render service:

```
LIBRARY_S3_BUCKET=sendrack-assets
LIBRARY_S3_REGION=auto
LIBRARY_S3_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
LIBRARY_S3_ACCESS_KEY_ID=<private value from Cloudflare>
LIBRARY_S3_SECRET_ACCESS_KEY=<private value from Cloudflare>
LIBRARY_S3_FORCE_PATH_STYLE=true
LIBRARY_QUOTA_BYTES=5368709120
LIBRARY_MAX_FILE_BYTES=262144000
```

The quota defaults to 5 GiB and the per-file limit to 250 MiB. These are application limits, not purchased storage or a provider cost cap.

4. In the bucket's CORS settings, add your exact admin origin. For the current Render host:

```json
[
  {
    "AllowedOrigins": ["https://sendrack-api.onrender.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "If-None-Match"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

If you use a custom admin domain, add its HTTPS origin explicitly. No wildcard public access is needed.

5. Save the environment and redeploy. Sign in again and confirm **Storage connected** in File library.
6. Upload a small spreadsheet and an image. Refresh, download them, compare their contents, then remove the test files. Test a larger video on a stable connection.

## Amazon S3 alternative

Use a private S3 bucket with Block Public Access enabled, bucket-scoped read/write credentials, the bucket's AWS region in `LIBRARY_S3_REGION`, and the same CORS rule. Leave `LIBRARY_S3_ENDPOINT` and `LIBRARY_S3_FORCE_PATH_STYLE` unset for standard S3. Prefer bucket default encryption and your established backup/versioning policy.

## Operational limits

- The library does not preview or execute uploaded files; downloads are attachments.
- Upload reservations expire after one hour. Interrupted transfers can leave private unconfirmed objects; review and remove orphan objects using the bucket's administrative tools, comparing object keys with `library_files`. Do not apply an expiry rule to the entire prefix, since that would delete confirmed files too.
- There is no folder rename/delete interface in this release. File removal is permanent for newly uploaded objects unless your bucket's versioning/backup policy retains copies.
- Upload transfers are sequential and a tab/navigation cancellation stops the active transfer. API errors are shown; failed transfers are never marked saved.
- Real R2/S3 credentials, live storage delivery and the Render deployment must be verified separately. Local checks use an injected test storage adapter; that adapter is rejected in production.

## Verification

`node --test --test-isolation=none tests/library.test.mjs`

`node tests/library-ui.mjs`

The same API tests run with an isolated PostgreSQL schema when `SENDRACK_TEST_POSTGRES_URL` is set. Existing SQLite import tooling includes the new metadata tables and suppresses default library seeding during target initialization to retain its empty-target checks.
