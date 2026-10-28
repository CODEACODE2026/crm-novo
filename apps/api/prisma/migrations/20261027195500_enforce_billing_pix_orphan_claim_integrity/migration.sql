-- FIX1 closes the cross-row integrity gap in Task 7C claims. The original
-- evidence, decision ledger and financial records remain unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.billing_pix_orphan_claim_validate_insert() RETURNS trigger AS $$
DECLARE
  decision_record public."billing_pix_orphan_webhook_correlation_events"%ROWTYPE;
  evidence_record public."billing_pix_orphan_webhook_events"%ROWTYPE;
  attempt_record public."billing_pix_attempts"%ROWTYPE;
  execution_record public."billing_executions"%ROWTYPE;
BEGIN
  -- Use the same evidence lock namespace as the 7C privileged operations. Row
  -- locks then make the decision/attempt/execution snapshot stable until commit.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pix:orphan-evidence:' || NEW."orphanWebhookEventId"::text, 0)
  );

  SELECT e.* INTO decision_record
  FROM public."billing_pix_orphan_webhook_correlation_events" e
  WHERE e."id" = NEW."decisionEventId"
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing orphan correlation claim decision event was not found'
      USING ERRCODE = '23514';
  END IF;

  IF decision_record."decision" IS DISTINCT FROM 'CORRELATED' THEN
    RAISE EXCEPTION 'Billing orphan correlation claim requires a CORRELATED decision'
      USING ERRCODE = '23514';
  END IF;

  IF decision_record."orphanWebhookEventId" IS DISTINCT FROM NEW."orphanWebhookEventId"
    OR decision_record."billingPixAttemptId" IS DISTINCT FROM NEW."billingPixAttemptId"
    OR decision_record."billingExecutionId" IS DISTINCT FROM NEW."billingExecutionId"
    OR decision_record."paymentIntentId" IS DISTINCT FROM NEW."paymentIntentId"
    OR decision_record."provider" IS DISTINCT FROM NEW."provider"
    OR decision_record."providerTransactionId" IS DISTINCT FROM NEW."providerTransactionId"
    OR decision_record."creationKey" IS DISTINCT FROM NEW."creationKey"
    OR decision_record."financialSetDigest" IS DISTINCT FROM NEW."financialSetDigest" THEN
    RAISE EXCEPTION 'Billing orphan correlation claim does not match its decision event'
      USING ERRCODE = '23514';
  END IF;

  SELECT e.* INTO evidence_record
  FROM public."billing_pix_orphan_webhook_events" e
  WHERE e."id" = NEW."orphanWebhookEventId"
  FOR KEY SHARE;

  IF NOT FOUND
    OR evidence_record."provider" IS DISTINCT FROM NEW."provider"
    OR evidence_record."providerTransactionId" IS DISTINCT FROM NEW."providerTransactionId" THEN
    RAISE EXCEPTION 'Billing orphan correlation claim does not match its original evidence'
      USING ERRCODE = '23514';
  END IF;

  SELECT a.* INTO attempt_record
  FROM public."billing_pix_attempts" a
  WHERE a."id" = NEW."billingPixAttemptId"
  FOR UPDATE;

  IF NOT FOUND
    OR attempt_record."billingExecutionId" IS DISTINCT FROM NEW."billingExecutionId"
    OR attempt_record."paymentIntentId" IS DISTINCT FROM NEW."paymentIntentId"
    OR attempt_record."provider" IS DISTINCT FROM NEW."provider"
    OR attempt_record."providerTransactionId" IS DISTINCT FROM NEW."providerTransactionId"
    OR attempt_record."creationKey" IS DISTINCT FROM NEW."creationKey" THEN
    RAISE EXCEPTION 'Billing orphan correlation claim does not match its durable PIX attempt'
      USING ERRCODE = '23514';
  END IF;

  SELECT x.* INTO execution_record
  FROM public."billing_executions" x
  WHERE x."id" = NEW."billingExecutionId"
  FOR UPDATE;

  IF NOT FOUND
    OR execution_record."receivableSetHash"::text IS DISTINCT FROM NEW."financialSetDigest" THEN
    RAISE EXCEPTION 'Billing orphan correlation claim does not match its financial execution'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_pix_orphan_claim_validate_insert_trigger
BEFORE INSERT ON public."billing_pix_orphan_webhook_correlation_claims"
FOR EACH ROW EXECUTE FUNCTION public.billing_pix_orphan_claim_validate_insert();

-- Once a claim exists, its durable attempt identity cannot be rewritten behind
-- the immutable ledger. Ordinary attempt status/reconciliation fields remain
-- governed by DATA1 and are not changed by this guard.
CREATE FUNCTION public.billing_pix_orphan_claim_preserve_attempt_identity() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."billing_pix_orphan_webhook_correlation_claims" c
    WHERE c."billingPixAttemptId" = OLD."id"
  ) AND (
    NEW."billingExecutionId" IS DISTINCT FROM OLD."billingExecutionId"
    OR NEW."paymentIntentId" IS DISTINCT FROM OLD."paymentIntentId"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."providerTransactionId" IS DISTINCT FROM OLD."providerTransactionId"
    OR NEW."creationKey" IS DISTINCT FROM OLD."creationKey"
  ) THEN
    RAISE EXCEPTION 'Billing PIX attempt identity is sealed by an orphan correlation claim'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_pix_orphan_claim_preserve_attempt_identity_trigger
BEFORE UPDATE OF "billingExecutionId", "paymentIntentId", "provider", "providerTransactionId", "creationKey"
ON public."billing_pix_attempts"
FOR EACH ROW EXECUTE FUNCTION public.billing_pix_orphan_claim_preserve_attempt_identity();

REVOKE ALL ON FUNCTION public.billing_pix_orphan_claim_validate_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_orphan_claim_preserve_attempt_identity() FROM PUBLIC;

COMMIT;
