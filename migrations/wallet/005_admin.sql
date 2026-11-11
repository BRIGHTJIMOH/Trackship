CREATE TABLE sendrack_wallet.admin_actions (
 id uuid PRIMARY KEY,
 actor_id text NOT NULL,
 actor_role text NOT NULL,
 action text NOT NULL,
 entity_id text NOT NULL,
 reason text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_admin_action BEFORE UPDATE OR DELETE ON sendrack_wallet.admin_actions FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.reject_change();
CREATE TABLE sendrack_wallet.admin_decisions (
 id uuid PRIMARY KEY,
 idempotency_key text NOT NULL UNIQUE,
 request_hash text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('payout_approve','payout_reject','refund','release','cancel_failed_release','retry_transfer')),
 entity_id uuid NOT NULL,
 amount_kobo bigint NOT NULL CHECK(amount_kobo BETWEEN 1 AND 9007199254740991),
 reason text NOT NULL,
 maker_id text NOT NULL,
 checker_id text,
 needs_checker boolean NOT NULL,
 policy_revision integer NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','executed','rejected')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(checker_id IS NULL OR checker_id<>maker_id)
);
CREATE TABLE sendrack_wallet.finance_staff (
 id uuid PRIMARY KEY,
 username text NOT NULL UNIQUE CHECK(length(username) BETWEEN 3 AND 80),
 role text NOT NULL CHECK(role IN ('Admin','Finance','Support')),
 password_salt text NOT NULL,
 password_hash text NOT NULL,
 enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE sendrack_wallet.finance_sessions (
 token_hash text PRIMARY KEY,
 staff_id uuid NOT NULL REFERENCES sendrack_wallet.finance_staff(id),
 credential_tag text NOT NULL,
 expires bigint NOT NULL
);
CREATE TABLE sendrack_wallet.finance_login_limits (
 ip_hash text PRIMARY KEY,
 attempts integer NOT NULL,
 until_ms bigint NOT NULL
);
CREATE TABLE sendrack_wallet.disputes (
 id uuid PRIMARY KEY,
 hold_id uuid NOT NULL REFERENCES sendrack_wallet.holds(id),
 reason text NOT NULL,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','resolved')),
 opened_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE sendrack_wallet.holds ADD COLUMN final_otp_verified boolean NOT NULL DEFAULT false;
