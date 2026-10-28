-- Manual rollback for an unactivated Task 7A deployment only.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DROP FUNCTION IF EXISTS public.billing_pix_quarantine_orphan_webhook(
  UUID, public."PaymentProviderCode", TEXT, TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ,
  public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT
);
DROP TRIGGER IF EXISTS billing_pix_orphan_webhook_event_guard_trigger
  ON public."billing_pix_orphan_webhook_events";
DROP FUNCTION IF EXISTS public.billing_pix_orphan_webhook_event_guard();
DROP TABLE IF EXISTS public."billing_pix_orphan_webhook_events";

ALTER TABLE public."billing_actor_assertions"
  DROP CONSTRAINT "billing_actor_assertions_context_check",
  ADD CONSTRAINT "billing_actor_assertions_context_check" CHECK (
    "operation" IN (
      'billing.pix.reserve', 'billing.pix.prepare-create', 'billing.pix.record-create-result',
      'billing.pix.reconcile-create-result',
      'billing.execution.transition', 'billing.receivable.amend'
    )
    AND "expectedVersion" >= 0
    AND "financialSetDigest" ~ '^[0-9a-f]{64}$'
    AND "argumentsDigest" ~ '^[0-9a-f]{64}$'
    AND (
      ("operation" = 'billing.receivable.amend' AND "receivableId" IS NOT NULL)
      OR ("operation" <> 'billing.receivable.amend' AND "receivableId" IS NULL)
    )
  );

COMMIT;
