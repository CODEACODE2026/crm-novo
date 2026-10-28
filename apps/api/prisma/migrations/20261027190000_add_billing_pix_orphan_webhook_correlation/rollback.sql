-- Manual rollback for an unactivated Task 7C deployment only. Once correlation
-- evidence exists, retain it and use a forward compensating migration instead.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DROP FUNCTION IF EXISTS public.billing_pix_correlate_orphan_webhook(
  UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT,
  public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.billing_pix_analyze_orphan_webhook(
  UUID, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.billing_pix_orphan_webhook_correlation_context(UUID);
DROP FUNCTION IF EXISTS public.billing_pix_orphan_correlation_verify_actor(
  TEXT, UUID, UUID, TEXT, INTEGER, TEXT, public."BillingActorType", UUID,
  TEXT, BIGINT, UUID, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.billing_pix_orphan_correlation_uuid(TEXT);
DROP TRIGGER IF EXISTS billing_pix_orphan_correlation_claims_guard_trigger
  ON public."billing_pix_orphan_webhook_correlation_claims";
DROP TRIGGER IF EXISTS billing_pix_orphan_correlation_events_guard_trigger
  ON public."billing_pix_orphan_webhook_correlation_events";
DROP FUNCTION IF EXISTS public.billing_pix_orphan_correlation_guard();
DROP TABLE IF EXISTS public."billing_pix_orphan_webhook_correlation_claims";
DROP TABLE IF EXISTS public."billing_pix_orphan_webhook_correlation_events";
DROP TYPE IF EXISTS public."BillingPixOrphanCorrelationDecision";

ALTER TABLE public."billing_actor_assertions"
  DROP CONSTRAINT "billing_actor_assertions_context_check",
  ADD CONSTRAINT "billing_actor_assertions_context_check" CHECK (
    "operation" IN (
      'billing.pix.reserve', 'billing.pix.prepare-create', 'billing.pix.record-create-result',
      'billing.pix.reconcile-create-result', 'billing.pix.quarantine-orphan-webhook',
      'billing.execution.transition', 'billing.receivable.amend'
    )
    AND "expectedVersion" >= 0
    AND "financialSetDigest" ~ '^[0-9a-f]{64}$'
    AND "argumentsDigest" ~ '^[0-9a-f]{64}$'
    AND (("operation" = 'billing.receivable.amend' AND "receivableId" IS NOT NULL)
      OR ("operation" <> 'billing.receivable.amend' AND "receivableId" IS NULL))
    AND ("operation" <> 'billing.pix.quarantine-orphan-webhook'
      OR ("billingExecutionId" = "messageDispatchId" AND "expectedVersion" = 0))
  );

COMMIT;
