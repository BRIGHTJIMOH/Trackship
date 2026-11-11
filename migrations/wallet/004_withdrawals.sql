CREATE TABLE sendrack_wallet.settings (
 id integer PRIMARY KEY CHECK(id=1),
 revision integer NOT NULL DEFAULT 1,
 tiers jsonb NOT NULL DEFAULT '{}'::jsonb,
 approval_threshold_kobo bigint CHECK(approval_threshold_kobo BETWEEN 1 AND 9007199254740991),
 platform_fee_bps integer NOT NULL DEFAULT 0 CHECK(platform_fee_bps BETWEEN 0 AND 10000)
);
INSERT INTO sendrack_wallet.settings(id) VALUES(1);
CREATE TABLE sendrack_wallet.wallet_security (
 wallet_id uuid PRIMARY KEY REFERENCES sendrack_wallet.wallets(id),
 pin_salt text NOT NULL,
 pin_hash text NOT NULL,
 pin_failures integer NOT NULL DEFAULT 0,
 locked_until bigint NOT NULL DEFAULT 0
);
CREATE TABLE sendrack_wallet.withdrawal_quotes (
 id uuid PRIMARY KEY,
 wallet_id uuid NOT NULL REFERENCES sendrack_wallet.wallets(id),
 idempotency_key text NOT NULL UNIQUE,
 input_hash text NOT NULL,
 amount_kobo bigint NOT NULL CHECK(amount_kobo BETWEEN 1 AND 9007199254740991),
 beneficiary_id text NOT NULL,
 account_name text NOT NULL,
 masked_account text NOT NULL,
 bank_code text NOT NULL,
 expires bigint NOT NULL
);
CREATE TABLE sendrack_wallet.wallet_challenges (
 id uuid PRIMARY KEY,
 wallet_id uuid NOT NULL REFERENCES sendrack_wallet.wallets(id),
 purpose text NOT NULL CHECK(purpose IN ('pin','withdrawal')),
 binding text NOT NULL,
 salt text NOT NULL,
 code_hash text NOT NULL,
 expires bigint NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 used boolean NOT NULL DEFAULT false,
 created_at bigint NOT NULL
);
CREATE INDEX challenges_wallet ON sendrack_wallet.wallet_challenges(wallet_id,created_at);
CREATE TABLE sendrack_wallet.payouts (
 id uuid PRIMARY KEY,
 wallet_id uuid NOT NULL REFERENCES sendrack_wallet.wallets(id),
 quote_id uuid NOT NULL UNIQUE REFERENCES sendrack_wallet.withdrawal_quotes(id),
 idempotency_key text NOT NULL UNIQUE,
 amount_kobo bigint NOT NULL CHECK(amount_kobo BETWEEN 1 AND 9007199254740991),
 tier text NOT NULL,
 state text NOT NULL DEFAULT 'awaiting_approval' CHECK(state IN ('awaiting_approval','pending','paid','failed','rejected')),
 outbox_id uuid UNIQUE REFERENCES sendrack_wallet.outbox(id),
 journal_id uuid UNIQUE REFERENCES sendrack_wallet.transactions(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE sendrack_wallet.outbox ADD COLUMN payout_id uuid REFERENCES sendrack_wallet.payouts(id);
CREATE TRIGGER immutable_quote BEFORE UPDATE OR DELETE ON sendrack_wallet.withdrawal_quotes
 FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.reject_change();
-- Reserved cache must equal outstanding shipment allocations plus pending payouts.
CREATE FUNCTION sendrack_wallet.check_reserved() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; target_wallet uuid; actual bigint; expected numeric;
BEGIN
 IF TG_TABLE_NAME='accounts' THEN target=NEW.id;
 ELSIF TG_TABLE_NAME='payouts' THEN SELECT account_id INTO target FROM sendrack_wallet.wallets WHERE id=NEW.wallet_id;
 ELSE SELECT w.account_id INTO target FROM sendrack_wallet.holds h JOIN sendrack_wallet.wallets w ON w.id=h.vendor_wallet_id WHERE h.id=NEW.hold_id; END IF;
 SELECT id INTO target_wallet FROM sendrack_wallet.wallets WHERE account_id=target;
 SELECT held_kobo INTO actual FROM sendrack_wallet.accounts WHERE id=target;
 SELECT coalesce(sum(s.amount_kobo-s.released_kobo-s.refunded_kobo),0) INTO expected
  FROM sendrack_wallet.hold_stages s JOIN sendrack_wallet.holds h ON h.id=s.hold_id WHERE h.vendor_wallet_id=target_wallet;
 SELECT expected+coalesce(sum(amount_kobo),0) INTO expected FROM sendrack_wallet.payouts WHERE wallet_id=target_wallet AND state IN ('awaiting_approval','pending');
 IF actual<>expected THEN RAISE EXCEPTION 'Reserved balance must match holds and pending withdrawals' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER reserved_account AFTER INSERT OR UPDATE ON sendrack_wallet.accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.check_reserved();
CREATE CONSTRAINT TRIGGER reserved_stages AFTER INSERT OR UPDATE ON sendrack_wallet.hold_stages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.check_reserved();
CREATE CONSTRAINT TRIGGER reserved_payout AFTER INSERT OR UPDATE ON sendrack_wallet.payouts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.check_reserved();
