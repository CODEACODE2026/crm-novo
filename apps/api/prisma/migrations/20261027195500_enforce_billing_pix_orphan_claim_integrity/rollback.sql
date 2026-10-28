-- Manual rollback for an unactivated Task 7C FIX1 deployment only.
-- It removes only the additional integrity guards introduced by FIX1.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DROP TRIGGER IF EXISTS billing_pix_orphan_claim_preserve_attempt_identity_trigger
  ON public."billing_pix_attempts";
DROP TRIGGER IF EXISTS billing_pix_orphan_claim_validate_insert_trigger
  ON public."billing_pix_orphan_webhook_correlation_claims";

DROP FUNCTION IF EXISTS public.billing_pix_orphan_claim_preserve_attempt_identity();
DROP FUNCTION IF EXISTS public.billing_pix_orphan_claim_validate_insert();

COMMIT;
