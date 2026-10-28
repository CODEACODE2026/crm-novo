-- FIX2 preserves the immutable orphan-correlation identity while allowing the
-- approved IMPL5 reconciliation to enrich a claimed AMBIGUOUS attempt with the
-- exact Billing PaymentIntent proven by PostgreSQL.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION public.billing_pix_orphan_claim_preserve_attempt_identity()
RETURNS trigger AS $$
DECLARE
  execution_record public."billing_executions"%ROWTYPE;
  intent_record public."payment_intents"%ROWTYPE;
  receivable_id UUID;
  receivable_count INTEGER;
  group_item_count INTEGER;
  snapshot_amount NUMERIC(12,2);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public."billing_pix_orphan_webhook_correlation_claims" c
    WHERE c."billingPixAttemptId" = OLD."id"
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW."billingExecutionId" IS DISTINCT FROM OLD."billingExecutionId"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."providerTransactionId" IS DISTINCT FROM OLD."providerTransactionId"
    OR NEW."creationKey" IS DISTINCT FROM OLD."creationKey" THEN
    RAISE EXCEPTION 'Billing PIX attempt identity is sealed by an orphan correlation claim'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."paymentIntentId" IS NOT DISTINCT FROM OLD."paymentIntentId" THEN
    RETURN NEW;
  END IF;

  -- A claim is a point-in-time snapshot. Only the first, exact local intent
  -- link may enrich an attempt that was correlated while still unlinked.
  IF OLD."paymentIntentId" IS NOT NULL OR NEW."paymentIntentId" IS NULL THEN
    RAISE EXCEPTION 'Billing PIX attempt PaymentIntent enrichment is immutable'
      USING ERRCODE = '23514';
  END IF;

  -- Follow the shared deterministic receivable lock namespace without waiting
  -- behind a caller that acquired locks in the opposite order. Approved DATA1
  -- reconciliation already owns these locks and therefore succeeds reentrantly.
  FOR receivable_id IN
    SELECT ber."receivableId"
    FROM public."billing_execution_receivables" ber
    WHERE ber."billingExecutionId" = OLD."billingExecutionId"
    ORDER BY ber."receivableId"
  LOOP
    IF NOT pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended('pix:receivable:' || receivable_id::text, 0)
    ) THEN
      RAISE EXCEPTION 'Billing PIX intent enrichment conflicts with a financial mutation'
        USING ERRCODE = '40001';
    END IF;
  END LOOP;

  SELECT x.* INTO execution_record
  FROM public."billing_executions" x
  WHERE x."id" = OLD."billingExecutionId";

  SELECT pi.* INTO intent_record
  FROM public."payment_intents" pi
  WHERE pi."id" = NEW."paymentIntentId"
  FOR UPDATE;

  SELECT count(*), COALESCE(sum(ber."amountSnapshot"), 0)
  INTO receivable_count, snapshot_amount
  FROM public."billing_execution_receivables" ber
  WHERE ber."billingExecutionId" = OLD."billingExecutionId";

  IF execution_record."id" IS NULL
    OR NOT execution_record."isCurrent"
    OR receivable_count < 1
    OR intent_record."id" IS NULL
    OR intent_record."origin" IS DISTINCT FROM 'BILLING'
    OR intent_record."provider" IS DISTINCT FROM OLD."provider"
    OR intent_record."providerTransactionId" IS DISTINCT FROM OLD."providerTransactionId"
    OR intent_record."creationKey" IS DISTINCT FROM OLD."creationKey"
    OR intent_record."amount" IS DISTINCT FROM snapshot_amount
    OR intent_record."status" NOT IN ('CREATED', 'WAITING_PAYMENT') THEN
    RAISE EXCEPTION 'Billing PIX intent enrichment does not match the claimed financial identity'
      USING ERRCODE = '23514';
  END IF;

  IF receivable_count = 1 THEN
    IF intent_record."paymentGroupId" IS NOT NULL
      OR intent_record."receivableId" IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public."billing_execution_receivables" ber
        JOIN public."receivables" r ON r."id" = ber."receivableId"
        WHERE ber."billingExecutionId" = OLD."billingExecutionId"
          AND ber."receivableId" = intent_record."receivableId"
          AND r."clientId" = execution_record."clientId"
          AND r."amount" = ber."amountSnapshot"
          AND r."dueDate" = ber."dueDateSnapshot"
      ) THEN
      RAISE EXCEPTION 'Billing PIX individual intent does not match the claimed receivable'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF intent_record."receivableId" IS NOT NULL OR intent_record."paymentGroupId" IS NULL THEN
      RAISE EXCEPTION 'Billing PIX grouped intent is required for the claimed receivable set'
        USING ERRCODE = '23514';
    END IF;

    PERFORM pg."id"
    FROM public."payment_groups" pg
    WHERE pg."id" = intent_record."paymentGroupId"
      AND pg."clientId" = execution_record."clientId"
      AND pg."totalAmount" = snapshot_amount
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Billing PIX payment group does not match the claimed client and amount'
        USING ERRCODE = '23514';
    END IF;

    PERFORM pgi."id"
    FROM public."payment_group_items" pgi
    WHERE pgi."paymentGroupId" = intent_record."paymentGroupId"
    ORDER BY pgi."id"
    FOR KEY SHARE;

    SELECT count(*) INTO group_item_count
    FROM public."payment_group_items" pgi
    WHERE pgi."paymentGroupId" = intent_record."paymentGroupId";

    IF group_item_count <> receivable_count OR EXISTS (
      (SELECT pgi."receivableId", pgi."amount"
       FROM public."payment_group_items" pgi
       WHERE pgi."paymentGroupId" = intent_record."paymentGroupId"
       EXCEPT
       SELECT ber."receivableId", ber."amountSnapshot"
       FROM public."billing_execution_receivables" ber
       WHERE ber."billingExecutionId" = OLD."billingExecutionId")
      UNION ALL
      (SELECT ber."receivableId", ber."amountSnapshot"
       FROM public."billing_execution_receivables" ber
       WHERE ber."billingExecutionId" = OLD."billingExecutionId"
       EXCEPT
       SELECT pgi."receivableId", pgi."amount"
       FROM public."payment_group_items" pgi
       WHERE pgi."paymentGroupId" = intent_record."paymentGroupId")
    ) THEN
      RAISE EXCEPTION 'Billing PIX payment group does not match the exact claimed receivable set'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."billing_execution_receivables" ber
    JOIN public."payment_intents" pi ON pi."receivableId" = ber."receivableId"
    WHERE ber."billingExecutionId" = OLD."billingExecutionId"
      AND pi."id" IS DISTINCT FROM NEW."paymentIntentId"
      AND pi."status" IN ('CREATED','WAITING_PAYMENT','PAID','REFUNDED')
    UNION ALL
    SELECT 1
    FROM public."billing_execution_receivables" ber
    JOIN public."payment_group_items" pgi ON pgi."receivableId" = ber."receivableId"
    JOIN public."payment_intents" pi ON pi."paymentGroupId" = pgi."paymentGroupId"
    WHERE ber."billingExecutionId" = OLD."billingExecutionId"
      AND pi."id" IS DISTINCT FROM NEW."paymentIntentId"
      AND pi."status" IN ('CREATED','WAITING_PAYMENT','PAID','REFUNDED')
  ) THEN
    RAISE EXCEPTION 'Billing PIX intent enrichment overlaps another active financial intent'
      USING ERRCODE = '23514';
  END IF;

  -- DATA1 already has deferred constraint triggers that require attempt,
  -- execution and dispatch to reference the same intent at commit. Therefore a
  -- direct attempt-only UPDATE cannot commit even after this relational proof.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.billing_pix_orphan_claim_preserve_attempt_identity() FROM PUBLIC;

COMMIT;
