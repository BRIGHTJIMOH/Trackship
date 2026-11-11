CREATE TABLE sendrack_wallet.reconciliation_runs (
 id uuid PRIMARY KEY,
 idempotency_key text NOT NULL UNIQUE,
 state text NOT NULL CHECK(state IN ('running','completed','completed_with_mismatches','failed')),
 actor_id text NOT NULL,
 lease_token uuid NOT NULL,
 lease_until bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz
);
CREATE TABLE sendrack_wallet.reconciliation_items (
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES sendrack_wallet.reconciliation_runs(id),
 wallet_id uuid REFERENCES sendrack_wallet.wallets(id),
 account_id uuid NOT NULL REFERENCES sendrack_wallet.accounts(id),
 kind text NOT NULL,
 reference text NOT NULL,
 detail jsonb NOT NULL,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','resolved')),
 resolved_by text,
 resolution_reason text,
 resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(run_id,account_id,kind,reference)
);
CREATE INDEX open_reconciliation_items ON sendrack_wallet.reconciliation_items(state,created_at);
CREATE TABLE sendrack_wallet.reconciliation_observations (
 run_id uuid NOT NULL REFERENCES sendrack_wallet.reconciliation_runs(id),
 account_id uuid NOT NULL REFERENCES sendrack_wallet.accounts(id),
 complete boolean NOT NULL,
 bank_balance_kobo bigint,
 ledger_balance_kobo bigint NOT NULL,
 provider_revision bigint,
 PRIMARY KEY(run_id,account_id)
);

CREATE TRIGGER immutable_reconciliation_observation BEFORE UPDATE OR DELETE ON sendrack_wallet.reconciliation_observations FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.reject_change();

ALTER TABLE sendrack_wallet.wallets ADD COLUMN reconciliation_blocked boolean NOT NULL DEFAULT false;
