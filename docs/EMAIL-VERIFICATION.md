# SendRack account email verification

## User flow

New vendor and rider accounts complete their existing profile and ID form, then enter an email address. Sending an email does not create an account, session or verified identity. The user must enter the correct code before the server creates the account and issues its scoped session. The app then submits the retained ID evidence and finishes PIN setup.

Returning users select Vendor/Rider → Log in with email, use their previously verified email and enter a new code. Email login retrieves the original account ID, phone, shipments and identity status; it does not create a replacement account. Email addresses are unique within each role; vendor and rider accounts remain separate.

Form details and ID uploads stay in memory during provider errors, resends and switching to the inbox. If email verification succeeds but the subsequent ID upload fails, the app retains the server-issued authenticated session and retries the upload; it does not consume or bypass the code a second time. Reloading the page or terminating the browser process still loses this unsaved in-memory signup. Sensitive pending ID photos are not copied to browser local storage.

## Existing phone accounts

Existing accounts are not assigned or verified an email automatically. Sign in using the existing device PIN and saved, valid hosted session, or the legacy SMS login if configured. In Profile → Enable email login, request a code and prove ownership of the email. Both requesting and completing linking require a valid server session for that same account. A local-only PIN without a valid cloud session cannot prove ownership to the server. A phone number and a newly verified email are insufficient to take over an existing phone account.

Accounts with neither a valid hosted session nor functioning legacy SMS need operator-assisted ownership recovery before email linking. No admin verification shortcut or recovery bypass is added. Changing an already-linked email is also left to a separately designed recovery process.

## Code policy

- Six random digits generated on the server, delivered only by email; only a salted hash is stored.
- Ten-minute expiry; consumed atomically with account/session creation. Used codes cannot be replayed.
- Five incorrect attempts lock a challenge.
- One minute between requests and at most five requests per hour for the same role/address or phone, persisted in the database across restarts.
- Successful resends supersede earlier codes for that account/address. Failed/uncertain sends count toward limits and their challenge is invalidated.
- Verification checks the original role, account ID and linked email; suspension and revoked sessions still apply.
- Email verification does not verify the contact phone, approve government ID or activate payouts.

## Provider setup: Resend

1. Create or use your Resend account. Add a domain you control and publish the DNS records Resend supplies. Wait until the sender domain is verified. Use an address on that domain (for example `SendRack <accounts@YOUR-VERIFIED-DOMAIN>`). A provider sandbox/test sender may be restricted to the provider-account owner's address and is not sufficient for public signup.
2. Create a sending API key scoped to the sender/domain where supported. Store it privately in the existing Render service's Environment settings; never put it in GitHub, the web app, an APK or chat.
3. Set exactly these new environment values on `sendrack-api`:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | The private Resend sending API key |
| `EMAIL_FROM` | The sender address or `SendRack <sender@verified-domain>` |

Keep DATABASE_URL, DATABASE_SSL, identity encryption key, admin credentials, payment/SMS settings and all other environment values unchanged. No new dependency, Render resource or paid Render plan is required. Provider-account sending quotas and domain/account approval must be satisfied independently.

4. Deploy the merged source on the existing `apk-test-v0.7.0` service. Runtime uses `https://api.resend.com/emails` over HTTPS, with a timeout and no plaintext-code logging. If the hosting environment restricts outbound destinations, allow `api.resend.com` there. This is separate from the Codex verification environment's access to the public Render URL.
5. Test vendor signup and rider signup at `/app` with inboxes permitted by your provider account. Verify wrong codes fail, the correct code completes signup and ID submission, a returning email login retrieves the same account, and resends obey the cooldown. Check sender DNS/deliverability, spam folders and provider delivery logs if messages do not arrive. Do not disable verification to work around delivery failures.

Missing configuration and provider errors return 503 and leave the form available for retry; no development/test code is returned to a browser and no account is automatically marked verified. Config readiness only establishes that key/sender values exist; actual provider authorization and delivery require a live test after setup.

SMS remains separate for legacy phone accounts and customer delivery confirmation. Email account verification does not replace customer delivery OTPs, tracking, payment callbacks or provider webhooks. The waitlist remains a waitlist; it does not create verified app accounts or send campaigns automatically.

## Database and deployment

Additive startup changes add nullable `email`/`email_verified_at` columns and per-role unique indexes to the existing account tables, plus `email_account_challenges` and rate-query indexes. Existing account/identity/shipments rows and legacy SMS challenges remain intact. Existing email columns are never backfilled as verified. The SQLite import allowlist includes the new challenge table. Production PostgreSQL migration verification still requires a test database.

Implementation endpoints are `POST /api/accounts/email/request-code` (`signup`, `login`, authenticated `link`) and `POST /api/accounts/email/verify-code`. Legacy phone endpoints are retained for existing clients. The changes are prepared for deployment; no production provider credentials, DNS, domain, Render resources, database settings, plans or Android signing identity were changed in this session.

## Validation

Backend tests cover both roles, hash-only code storage, wrong codes, concurrent replay, expiry, five-attempt lockout, cooldown/hourly limits, superseded resends, fail-closed provider behavior, login account continuity and authenticated legacy linking. Provider tests mock Resend responses and do not send real mail. Browser tests cover signup with email, inbox/background preservation, wrong codes, email-provider failure, retrying a failed ID upload after proof, returning email login and linking an existing account from Profile.
