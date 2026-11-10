CREATE TABLE sendrack_wallet.holds (
 id uuid PRIMARY KEY,
 shipment_id text NOT NULL UNIQUE,
 vendor_wallet_id uuid NOT NULL REFERENCES sendrack_wallet.wallets(id),
 delivery_type text NOT NULL CHECK(delivery_type IN ('intrastate','interstate')),
 amount_kobo bigint NOT NULL CHECK(amount_kobo BETWEEN 1 AND 9007199254740991),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','disputed','closed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE sendrack_wallet.hold_stages (
 id uuid PRIMARY KEY,
 hold_id uuid NOT NULL REFERENCES sendrack_wallet.holds(id),
 leg text NOT NULL CHECK(leg IN ('pickup','carrier','lastmile','platform_fee')),
 amount_kobo bigint NOT NULL CHECK(amount_kobo BETWEEN 1 AND 9007199254740991),
 pending_kobo bigint NOT NULL DEFAULT 0 CHECK(pending_kobo>=0),
 released_kobo bigint NOT NULL DEFAULT 0 CHECK(released_kobo>=0),
 refunded_kobo bigint NOT NULL DEFAULT 0 CHECK(refunded_kobo>=0),
 recipient_wallet_id uuid REFERENCES sendrack_wallet.wallets(id),
 CHECK(pending_kobo+released_kobo+refunded_kobo<=amount_kobo),
 UNIQUE(hold_id,leg)
);
CREATE TABLE sendrack_wallet.outbox (
 id uuid PRIMARY KEY,
 idempotency_key text NOT NULL UNIQUE,
 purpose text NOT NULL CHECK(purpose IN ('stage_release','withdrawal')),
 stage_id uuid REFERENCES sendrack_wallet.hold_stages(id),
 source_wallet_id uuid NOT NULL REFERENCES sendrack_wallet.wallets(id),
 target_wallet_id uuid REFERENCES sendrack_wallet.wallets(id),
 target_provider_wallet_id text,
 beneficiary_id text,
 amount_kobo bigint NOT NULL CHECK(amount_kobo BETWEEN 1 AND 9007199254740991),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','retry','pending_confirmation','failed','needs_attention','done','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at bigint NOT NULL DEFAULT 0,
 lease_until bigint NOT NULL DEFAULT 0,
 lease_token uuid,
 result_code text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((purpose='stage_release' AND stage_id IS NOT NULL AND target_provider_wallet_id IS NOT NULL) OR
       (purpose='withdrawal' AND beneficiary_id IS NOT NULL))
);
CREATE INDEX outbox_due ON sendrack_wallet.outbox(status,next_attempt_at);
CREATE FUNCTION sendrack_wallet.check_hold() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; expected numeric; actual bigint;
BEGIN
 IF TG_TABLE_NAME='holds' THEN target=NEW.id; ELSE target=NEW.hold_id; END IF;
 SELECT amount_kobo INTO actual FROM sendrack_wallet.holds WHERE id=target;
 SELECT coalesce(sum(amount_kobo),0) INTO expected FROM sendrack_wallet.hold_stages WHERE hold_id=target;
 IF expected<>actual THEN RAISE EXCEPTION 'Hold stage allocation must equal shipment price' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER allocated_hold AFTER INSERT OR UPDATE ON sendrack_wallet.holds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.check_hold();
CREATE CONSTRAINT TRIGGER allocated_stages AFTER INSERT OR UPDATE ON sendrack_wallet.hold_stages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sendrack_wallet.check_hold();
