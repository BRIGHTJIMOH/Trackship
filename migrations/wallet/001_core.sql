-- Additive, isolated Phase 1 schema. No existing SendRack table or balance is rewritten.
CREATE SCHEMA IF NOT EXISTS sendrack_wallet;
CREATE TABLE IF NOT EXISTS sendrack_wallet.schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE sendrack_wallet.accounts(
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('vendor','rider','platform_fee','bank_asset')),
 owner_id text NOT NULL,
 currency text NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 balance_kobo bigint NOT NULL DEFAULT 0 CHECK(abs(balance_kobo)<=9007199254740991),
 held_kobo bigint NOT NULL DEFAULT 0 CHECK(held_kobo>=0),
 available_kobo bigint GENERATED ALWAYS AS(balance_kobo-held_kobo) STORED,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(kind='bank_asset' OR balance_kobo>=held_kobo),
 CHECK(kind<>'bank_asset' OR held_kobo=0),
 UNIQUE(kind,owner_id)
);
CREATE TABLE sendrack_wallet.wallets(
 id uuid PRIMARY KEY,
 owner_role text NOT NULL CHECK(owner_role IN ('vendor','rider')),
 owner_id text NOT NULL,
 account_id uuid NOT NULL UNIQUE REFERENCES sendrack_wallet.accounts(id),
 provider_id text NOT NULL CHECK(provider_id='mock-bank'),
 provider_wallet_id text NOT NULL UNIQUE,
 provider_owner_reference text NOT NULL UNIQUE,
 mode text NOT NULL DEFAULT 'mock' CHECK(mode='mock'),
 currency text NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 kyc_reference text NOT NULL,
 bank_balance_kobo bigint NOT NULL DEFAULT 0 CHECK(bank_balance_kobo BETWEEN 0 AND 9007199254740991),
 bank_observed_at bigint NOT NULL DEFAULT 0 CHECK(bank_observed_at>=0),
 bank_revision bigint NOT NULL DEFAULT 0 CHECK(bank_revision>=0),
 bank_status text NOT NULL DEFAULT 'unconfirmed' CHECK(bank_status IN ('unconfirmed','matched','mismatch','unavailable')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_role,owner_id,mode)
);
CREATE TABLE sendrack_wallet.transactions(
 id uuid PRIMARY KEY,
 idempotency_key text NOT NULL UNIQUE CHECK(length(idempotency_key) BETWEEN 8 AND 160),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 kind text NOT NULL CHECK(length(kind) BETWEEN 1 AND 40),
 reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 160),
 memo text NOT NULL CHECK(length(memo)<=300),
 currency text NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 state text NOT NULL DEFAULT 'confirmed' CHECK(state IN ('pending','confirmed','failed','unknown')),
 sealed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE sendrack_wallet.ledger_entries(
 transaction_id uuid NOT NULL REFERENCES sendrack_wallet.transactions(id),
 line_number integer NOT NULL CHECK(line_number BETWEEN 1 AND 100),
 account_id uuid NOT NULL REFERENCES sendrack_wallet.accounts(id),
 debit_kobo bigint NOT NULL CHECK(debit_kobo BETWEEN 0 AND 9007199254740991),
 credit_kobo bigint NOT NULL CHECK(credit_kobo BETWEEN 0 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(transaction_id,line_number),
 UNIQUE(transaction_id,account_id),
 CHECK((debit_kobo>0 AND credit_kobo=0) OR (credit_kobo>0 AND debit_kobo=0))
);
CREATE INDEX ledger_entries_account ON sendrack_wallet.ledger_entries(account_id,created_at,transaction_id);
CREATE FUNCTION sendrack_wallet.reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Financial records are immutable; post a reversing transaction' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER immutable_ledger BEFORE UPDATE OR DELETE ON sendrack_wallet.ledger_entries FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.reject_change();
CREATE FUNCTION sendrack_wallet.protect_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Financial transactions cannot be deleted' USING ERRCODE='23514'; END IF;
 IF OLD.sealed OR ROW(NEW.id,NEW.idempotency_key,NEW.request_hash,NEW.kind,NEW.reference,NEW.memo,NEW.currency,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.idempotency_key,OLD.request_hash,OLD.kind,OLD.reference,OLD.memo,OLD.currency,OLD.created_at) THEN
  RAISE EXCEPTION 'Financial transaction identity is immutable' USING ERRCODE='23514';
 END IF;RETURN NEW;
END; $$;
CREATE TRIGGER immutable_transaction BEFORE UPDATE OR DELETE ON sendrack_wallet.transactions FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.protect_transaction();
CREATE FUNCTION sendrack_wallet.apply_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE closed boolean;
BEGIN
 SELECT sealed INTO closed FROM sendrack_wallet.transactions WHERE id=NEW.transaction_id FOR UPDATE;
 IF closed THEN RAISE EXCEPTION 'A sealed transaction cannot receive more entries' USING ERRCODE='23514'; END IF;
 UPDATE sendrack_wallet.accounts SET balance_kobo=balance_kobo+NEW.credit_kobo-NEW.debit_kobo WHERE id=NEW.account_id;
 RETURN NEW;
END; $$;
CREATE TRIGGER apply_entry BEFORE INSERT ON sendrack_wallet.ledger_entries FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.apply_entry();
CREATE FUNCTION sendrack_wallet.check_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; items bigint; debits numeric; credits numeric; tx_state text; tx_sealed boolean;
BEGIN
 IF TG_TABLE_NAME='transactions' THEN target=NEW.id; ELSE target=NEW.transaction_id; END IF;
 SELECT state,sealed INTO tx_state,tx_sealed FROM sendrack_wallet.transactions WHERE id=target;
 SELECT count(*),coalesce(sum(debit_kobo),0),coalesce(sum(credit_kobo),0) INTO items,debits,credits FROM sendrack_wallet.ledger_entries WHERE transaction_id=target;
 IF tx_state='confirmed' THEN
  IF NOT tx_sealed OR items<2 OR debits<>credits THEN RAISE EXCEPTION 'Confirmed journal must be sealed, balanced and have at least two entries' USING ERRCODE='23514'; END IF;
 ELSIF items<>0 OR tx_sealed THEN RAISE EXCEPTION 'Unconfirmed operations cannot alter the ledger' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER balanced_transaction AFTER INSERT OR UPDATE ON sendrack_wallet.transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.check_journal();
CREATE CONSTRAINT TRIGGER balanced_entries AFTER INSERT ON sendrack_wallet.ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.check_journal();
CREATE FUNCTION sendrack_wallet.protect_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.kind,NEW.owner_id,NEW.currency,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.kind,OLD.owner_id,OLD.currency,OLD.created_at) THEN RAISE EXCEPTION 'Account identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER immutable_account_identity BEFORE UPDATE ON sendrack_wallet.accounts FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.protect_account();
CREATE FUNCTION sendrack_wallet.check_account() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected numeric; actual bigint;
BEGIN
 SELECT coalesce(sum(credit_kobo-debit_kobo),0) INTO expected FROM sendrack_wallet.ledger_entries WHERE account_id=NEW.id;
 SELECT balance_kobo INTO actual FROM sendrack_wallet.accounts WHERE id=NEW.id;
 IF actual<>expected THEN RAISE EXCEPTION 'Account balance must equal immutable ledger entries' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER account_matches_ledger AFTER INSERT OR UPDATE ON sendrack_wallet.accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.check_account();
INSERT INTO sendrack_wallet.accounts(id,kind,owner_id) VALUES
 ('00000000-0000-4000-8000-000000000001','platform_fee','sendrack-platform'),
 ('00000000-0000-4000-8000-000000000002','bank_asset','mock-bank-control');
