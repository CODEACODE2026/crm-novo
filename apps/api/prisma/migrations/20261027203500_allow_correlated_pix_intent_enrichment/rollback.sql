-- Test-only rollback for FIX2. Restoring FIX1 also restores its excessive
-- prohibition of legitimate post-correlation PaymentIntent enrichment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION public.billing_pix_orphan_claim_preserve_attempt_identity()
RETURNS trigger AS $$
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

REVOKE ALL ON FUNCTION public.billing_pix_orphan_claim_preserve_attempt_identity() FROM PUBLIC;

COMMIT;
