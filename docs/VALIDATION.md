# TrackShip NG 0.5.0 validation

- Backend suite: **26 passing checks** covering separate accounts/session revocation, vendor passports, rider NIN/licence/registration, identity encryption, restart locking, service-area eligibility, one-winner acceptance, payment verification, handoffs, GPS freshness, OTP limits and exactly-once earnings.
- Mobile browser suite: **passed** with direct signup/login, vendor passport and bicycle/motor rider identity during signup, documents absent from localStorage, encrypted native-vault bridge contract, role-specific dashboards, hidden balances, Profile-only night mode/logout, no vendor rider-switch/service/backup controls, manual + baskets, collected metadata, omitted legacy metadata, reload/background reauthentication, independent rider completion after vendor logout and new-phone cloud login.
- Browser screenshots are generated in `artifacts/v0.5/`. Identity values are fictional test inputs. Provider requests use isolated substitutes; no real money or SMS was sent.
- APK package `ng.trackship.app`, version 0.5.0 / code 6, Android 8+ / target API 35. The build compiles native sources, verifies the APK signature, and uses the previous signing identity. Bundled web assets are compared with source before uploading.

Not yet verified on physical Android: installation/update, Keystore behavior, minimize/reopen lifecycle, photo picker exemption, notification scheduling/permissions/battery behavior and actual GPS. Browser tests exercise native bridge contracts, not an Android device. Real Paystack/Termii operation, public deployment, identity verification and live-money holding/payout/refund/dispute operations remain unactivated.

Vendor wallet funding is not implemented; its balance is unavailable. Rider Home uses the available live-delivery ledger amount, excluding test credits. No bank balance or provider settlement schedule is inferred. See LIVE-SETUP.md for activation prerequisites.
