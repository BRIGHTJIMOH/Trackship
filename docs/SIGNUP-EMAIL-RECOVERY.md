# Signup recovery and Resend sender correction

The reported iPhone screenshot is a real sender configuration failure: Resend's `onboarding@resend.dev` sender delivers only to the email registered to the Resend account. Rewriting the error cannot enable delivery to other users.

## Required account setup

1. Open the correct Resend account → Domains → Add domain. Use a domain you control, or a dedicated sending subdomain.
2. Add the DNS records Resend supplies in that domain's DNS dashboard. Copy the exact names and values from Resend; do not replace unrelated website or email records.
3. Wait for Resend to show the domain as verified.
4. Ensure the server's existing private Resend key has sending permission for that domain. If replacing it, enter the replacement only in Render's private environment settings.
5. In Render → existing `sendrack-api` service → Environment, set `EMAIL_FROM` to a real sender on that verified domain, for example `SendRack <accounts@YOUR_VERIFIED_DOMAIN>`.
6. Preserve `RESEND_API_KEY` if its permissions are correct. Never put this key in app code, an APK, GitHub or chat.
7. Save and redeploy. Test a fresh vendor and rider signup using consenting recipients outside the Resend account-owner address. Confirm actual code receipt, verification, ID submission and PIN completion.

Do not use the example placeholder domain literally. No sender domain has been invented or configured by this patch. Apple Developer enrollment does not resolve this email-provider restriction.

## Code corrections

- Browsers verify email before requesting identity uploads. Android retains its encrypted document-vault flow.
- Basic signup details are saved before the image-picker step. Browser identity and PIN stages retain a temporary authenticated session in session storage for reload recovery.
- ID numbers, residential identity addresses and ID images are not saved in browser storage. If the browser fully discards an unfinished identity form, it resumes that step; selecting its image again can be necessary. It does not restart business/account details.
- A failed identity upload keeps the current form and verified session available for retry. PIN setup is recoverable after a reload, and progress is cleared only after account entry succeeds.
- Customer-facing email errors are short; test-sender setup instructions appear in owner readiness and sanitized server logs. No OTP, recipient address or private key is logged.
- Email verification, identity review, role checks, PIN checks and revoked-session checks remain required.

## Release limits

The hosted browser fixes need the new backend/web release. An already-installed Android APK contains its own UI bundle and needs the updated APK for client recovery changes. Sender configuration affects both platforms immediately after the server is redeployed. Chromium vendor/rider recovery tests and an Android-bridge simulation are automated checks; real Safari and real Android phone confirmation remain necessary.
