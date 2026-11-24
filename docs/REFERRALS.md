# Waitlist referrals

This release connects the Referrals tab, app code sharing and website waitlist attribution. It does not pay rewards or count social-media likes.

## Owner setup

1. Open **App controls → Referrals**.
2. Add a campaign title and qualifying rules. State prize status and tie handling clearly; no reward amount is prefilled.
3. Optionally set start/end ISO timestamps including a timezone, e.g. `2026-11-25T09:00:00+01:00`.
4. Enable the campaign and save. It is off by default. Turning it off retains existing codes and records but stops crediting new signups.
5. Review contacts in **Review new referrals**. Check the contact is genuine and meets your rules, add a review note, then approve or reject.

The leaderboard uses reviewed/approved totals. Pending entries are unverified submissions and do not qualify automatically. Equal approved totals remain tied; no winner or payout is automatically selected. Review and settings changes are audited and owner-only, with existing session/CSRF safeguards. The page shows the top 100 referrers and oldest 100 pending entries; refresh after review to load more.

## Mobile usage

Install APK **0.7.41-fcm** or later. Sign in as vendor or rider, then open **Profile → Invite people**. Your unique account code is generated automatically on first visit. Use **Copy code** or **Share invite**. Codes remain the same across repeat visits and login sessions. Account suspension still blocks access.

Invites open the existing website with `?ref=CODE#waitlist`. The website fills in the optional code. People still choose vendor or rider/driver and provide the required details and consent. The page explains whether a referral was recorded or not eligible. Codes can be created and the waitlist can be shared while the campaign is off, but those signups are not credited to the promotion.

## Counting and limits

- Only a newly inserted waitlist email can be attributed; existing entries are never reassigned to a different referrer.
- A WhatsApp contact already on the waitlist is not credited again under another email.
- The referrer's own recorded phone/email is excluded. Additional fraud or identity concerns require owner review; the system does not prove phone/email ownership.
- Active campaign timing and referrer-account eligibility are checked at signup.
- Each accepted referral starts pending. Owner review changes the counted total; a completed review cannot be silently overwritten.
- Mobile users see only their code and totals, never referred people's contact details. Private details are owner-only.
- There is no OTP/email confirmation for waitlist signups in this release, no automatic reward transfer, and no social-media integration. Do not advertise pending contacts as verified people or promise an automatic prize.

The current campaign is the launch-waitlist campaign. Reusing/resetting it for a new competition requires a separate explicit campaign-management change; this screen does not reset counts.

## Release verification

Local checks cover authenticated vendor/rider codes, stable uniqueness, owner/CSRF restrictions, audience privacy, signup attribution, duplicate/self-referral exclusion, scheduling and reviewed totals. Browser checks cover real mobile Profile sharing, the waitlist form and owner review. APK startup checks exercise packaged dependencies and the Java asset allowlist; physical Android behavior still needs a device test.
