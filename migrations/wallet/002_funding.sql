-- Additive mock funding inbox and durable provider-receipt deduplication.
CREATE TABLE sendrack_wallet.funding_receipts (
 provider_id text NOT NULL CHECK (provider_id = 'mock-bank'),
 provider_transaction_id text NOT NULL CHECK (length(provider_transaction_id) BETWEEN 1 AND 160),
 wallet_id uuid NOT NULL REFERENCES sendrack_wallet.wallets(id),
 amount_kobo bigint NOT NULL CHECK (amount_kobo BETWEEN 1 AND 9007199254740991),
 currency text NOT NULL CHECK (currency = 'NGN'),
 journal_id uuid NOT NULL UNIQUE REFERENCES sendrack_wallet.transactions(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (provider_id, provider_transaction_id)
);
CREATE TABLE sendrack_wallet.webhook_events (
 event_id text PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 160),
 provider_id text NOT NULL,
 provider_transaction_id text NOT NULL,
 event_hash text NOT NULL CHECK (event_hash ~ '^[a-f0-9]{64}$'),
 payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
 outcome text NOT NULL CHECK (outcome IN ('credited', 'duplicate')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (provider_id, provider_transaction_id)
  REFERENCES sendrack_wallet.funding_receipts(provider_id, provider_transaction_id)
);
CREATE UNIQUE INDEX one_credit_event_per_receipt ON sendrack_wallet.webhook_events(provider_id, provider_transaction_id) WHERE outcome = 'credited';
CREATE TRIGGER immutable_funding_receipt BEFORE UPDATE OR DELETE ON sendrack_wallet.funding_receipts
 FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.reject_change();
CREATE TRIGGER immutable_webhook_event BEFORE UPDATE OR DELETE ON sendrack_wallet.webhook_events
 FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.reject_change();
CREATE FUNCTION sendrack_wallet.check_funding_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_account uuid; correct_entries bigint; total_entries bigint; correct_journal boolean;
BEGIN
 SELECT account_id INTO target_account FROM sendrack_wallet.wallets WHERE id = NEW.wallet_id;
 SELECT state = 'confirmed' AND sealed AND kind = 'wallet_funding' INTO correct_journal
  FROM sendrack_wallet.transactions WHERE id = NEW.journal_id;
 SELECT count(*), count(*) FILTER (WHERE
  (account_id = target_account AND credit_kobo = NEW.amount_kobo AND debit_kobo = 0) OR
  (account_id = '00000000-0000-4000-8000-000000000002'::uuid AND debit_kobo = NEW.amount_kobo AND credit_kobo = 0)
 ) INTO total_entries, correct_entries FROM sendrack_wallet.ledger_entries WHERE transaction_id = NEW.journal_id;
 IF correct_journal IS DISTINCT FROM true OR total_entries <> 2 OR correct_entries <> 2 THEN
  RAISE EXCEPTION 'Funding receipt must match its sealed funding journal' USING ERRCODE = '23514';
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER funding_receipt_matches_journal AFTER INSERT ON sendrack_wallet.funding_receipts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.check_funding_receipt();
