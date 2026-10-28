-- DATA1 is intentionally atomic. A busy production table must make the deploy fail
-- cleanly instead of waiting indefinitely or leaving partially installed objects.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

LOCK TABLE public."payment_intents", public."message_dispatches" IN SHARE ROW EXCLUSIVE MODE;

CREATE TYPE public."PaymentIntentOrigin" AS ENUM ('MANUAL', 'BILLING');
CREATE TYPE public."BillingExecutionStatus" AS ENUM (
  'SCHEDULED', 'PROCESSING', 'WAITING_PIX', 'READY_TO_SEND',
  'COMPLETED', 'BLOCKED', 'REVIEW_REQUIRED', 'CANCELED'
);
CREATE TYPE public."BillingPixStatus" AS ENUM (
  'NOT_STARTED', 'RESERVED', 'CREATING', 'CONFIRMED', 'AMBIGUOUS',
  'FAILED', 'EXPIRED', 'PAID', 'CANCELED', 'SUPERSEDED'
);
CREATE TYPE public."BillingDeliveryStatus" AS ENUM (
  'NOT_READY', 'READY', 'SENDING', 'SENT', 'AMBIGUOUS', 'FAILED', 'CANCELED'
);
CREATE TYPE public."BillingAuthorizationMode" AS ENUM (
  'LEGACY_BRAZIL', 'LEGACY_INTERNATIONAL', 'GLOBAL_INTERNATIONAL'
);
CREATE TYPE public."BillingActorType" AS ENUM ('USER', 'SYSTEM', 'WEBHOOK');
CREATE TYPE public."BillingAuditOrigin" AS ENUM ('BILLING');
CREATE TYPE public."BillingExecutionEventType" AS ENUM (
  'EXECUTION_CREATED', 'EXECUTION_STATUS_CHANGED', 'PIX_ATTEMPT_RESERVED',
  'PIX_STATUS_CHANGED', 'DELIVERY_STATUS_CHANGED', 'REVIEW_REQUIRED',
  'RECONCILED', 'CANCELED'
);

ALTER TABLE public."payment_intents"
  ADD COLUMN "origin" public."PaymentIntentOrigin" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "creationKey" TEXT;

ALTER TABLE public."message_dispatches"
  ADD COLUMN "paymentIntentId" UUID;

CREATE TABLE public."billing_executions" (
  "id" UUID NOT NULL,
  "messageDispatchId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "paymentIntentId" UUID,
  "executionKey" TEXT NOT NULL,
  "cycleKey" TEXT NOT NULL,
  "receivableSetHash" VARCHAR(64) NOT NULL,
  "authorizationMode" public."BillingAuthorizationMode" NOT NULL,
  "status" public."BillingExecutionStatus" NOT NULL DEFAULT 'SCHEDULED',
  "pixStatus" public."BillingPixStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "deliveryStatus" public."BillingDeliveryStatus" NOT NULL DEFAULT 'NOT_READY',
  "leaseOwner" TEXT,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "blockedCode" TEXT,
  "blockedReason" TEXT,
  "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "supersededAt" TIMESTAMP(3),
  "supersedesExecutionId" UUID,
  "lastActorType" public."BillingActorType" NOT NULL DEFAULT 'SYSTEM',
  "lastActorUserId" UUID,
  "lastMutationReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_executions_receivable_set_hash_check"
    CHECK ("receivableSetHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "billing_executions_lease_consistency_check"
    CHECK (
      ("leaseOwner" IS NULL AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)
      OR
      ("leaseOwner" IS NOT NULL AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
    ),
  CONSTRAINT "billing_executions_review_block_check"
    CHECK (NOT "reviewRequired" OR "blockedCode" IS NOT NULL),
  CONSTRAINT "billing_executions_actor_check"
    CHECK (
      ("lastActorType" = 'USER' AND "lastActorUserId" IS NOT NULL)
      OR
      ("lastActorType" IN ('SYSTEM', 'WEBHOOK') AND "lastActorUserId" IS NULL)
    ),
  CONSTRAINT "billing_executions_supersession_check"
    CHECK (
      ("isCurrent" AND "supersededAt" IS NULL)
      OR
      (NOT "isCurrent" AND "supersededAt" IS NOT NULL)
    ),
  CONSTRAINT "billing_executions_version_check" CHECK ("version" >= 0)
);

CREATE TABLE public."billing_execution_receivables" (
  "id" UUID NOT NULL,
  "billingExecutionId" UUID NOT NULL,
  "receivableId" UUID NOT NULL,
  "clientReferenceId" UUID NOT NULL,
  "amountSnapshot" DECIMAL(12,2) NOT NULL,
  "dueDateSnapshot" DATE NOT NULL,
  "statusSnapshot" public."ReceivableStatus" NOT NULL,
  "referenceSnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_execution_receivables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."billing_pix_attempts" (
  "id" UUID NOT NULL,
  "billingExecutionId" UUID NOT NULL,
  "paymentIntentId" UUID,
  "creationKey" TEXT NOT NULL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "status" public."BillingPixStatus" NOT NULL DEFAULT 'RESERVED',
  "provider" public."PaymentProviderCode",
  "providerCorrelationId" TEXT,
  "providerTransactionId" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
  "reconciledAt" TIMESTAMP(3),
  "reconciliationEvidence" TEXT,
  "startedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_pix_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_pix_attempts_not_started_check" CHECK ("status" <> 'NOT_STARTED'),
  CONSTRAINT "billing_pix_attempts_provider_identity_check" CHECK (
    ("providerTransactionId" IS NULL)
    OR ("provider" IS NOT NULL)
  )
);

CREATE TABLE public."billing_execution_events" (
  "id" UUID NOT NULL,
  "billingExecutionId" UUID NOT NULL,
  "eventType" public."BillingExecutionEventType" NOT NULL,
  "actorType" public."BillingActorType" NOT NULL,
  "actorUserId" UUID,
  "origin" public."BillingAuditOrigin" NOT NULL DEFAULT 'BILLING',
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_execution_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_execution_events_actor_check"
    CHECK (
      ("actorType" = 'USER' AND "actorUserId" IS NOT NULL)
      OR
      ("actorType" IN ('SYSTEM', 'WEBHOOK') AND "actorUserId" IS NULL)
    )
);

-- Secrets are provisioned by the migration owner after deploy and are never
-- readable by the application role. Assertions are one-shot, short-lived and
-- passed as ordinary function arguments, so connection pooling cannot leak an
-- actor through session state.
CREATE TABLE public."billing_actor_keys" (
  "actorType" public."BillingActorType" NOT NULL,
  "keyId" TEXT NOT NULL,
  "secret" BYTEA NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_actor_keys_pkey" PRIMARY KEY ("actorType", "keyId"),
  CONSTRAINT "billing_actor_keys_secret_strength_check" CHECK (octet_length("secret") >= 32),
  CONSTRAINT "billing_actor_keys_key_id_check" CHECK (btrim("keyId") <> '')
);

CREATE TABLE public."billing_actor_assertions" (
  "nonce" UUID NOT NULL,
  "actorType" public."BillingActorType" NOT NULL,
  "actorUserId" UUID,
  "principal" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "billingExecutionId" UUID NOT NULL,
  "messageDispatchId" UUID NOT NULL,
  "receivableId" UUID,
  "financialSetDigest" TEXT NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "argumentsDigest" TEXT NOT NULL,
  "issuedAtEpoch" BIGINT NOT NULL,
  "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_actor_assertions_pkey" PRIMARY KEY ("nonce"),
  CONSTRAINT "billing_actor_assertions_actor_check" CHECK (
    ("actorType" = 'USER' AND "actorUserId" IS NOT NULL)
    OR ("actorType" IN ('SYSTEM', 'WEBHOOK') AND "actorUserId" IS NULL)
  ),
  CONSTRAINT "billing_actor_assertions_context_check" CHECK (
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
  )
);

CREATE UNIQUE INDEX "payment_intents_creationKey_key" ON public."payment_intents"("creationKey");
CREATE INDEX "payment_intents_origin_idx" ON public."payment_intents"("origin");
ALTER TABLE public."payment_intents"
  ADD CONSTRAINT "payment_intents_billing_creation_key_check"
  CHECK ("origin" <> 'BILLING' OR "creationKey" IS NOT NULL);
CREATE UNIQUE INDEX "message_dispatches_paymentIntentId_key" ON public."message_dispatches"("paymentIntentId");
CREATE INDEX "message_dispatches_paymentIntentId_idx" ON public."message_dispatches"("paymentIntentId");

CREATE UNIQUE INDEX "billing_executions_paymentIntentId_key" ON public."billing_executions"("paymentIntentId");
CREATE UNIQUE INDEX "billing_executions_executionKey_key" ON public."billing_executions"("executionKey");
CREATE UNIQUE INDEX "billing_executions_leaseToken_key" ON public."billing_executions"("leaseToken");
CREATE UNIQUE INDEX "billing_executions_current_dispatch_key"
  ON public."billing_executions"("messageDispatchId") WHERE "isCurrent";
CREATE UNIQUE INDEX "billing_executions_current_client_cycle_key"
  ON public."billing_executions"("clientId", "cycleKey") WHERE "isCurrent";
CREATE INDEX "billing_executions_message_current_idx" ON public."billing_executions"("messageDispatchId", "isCurrent");
CREATE INDEX "billing_executions_client_cycle_current_idx" ON public."billing_executions"("clientId", "cycleKey", "isCurrent");
CREATE INDEX "billing_executions_supersedes_idx" ON public."billing_executions"("supersedesExecutionId");
CREATE INDEX "billing_executions_lastActorUserId_idx" ON public."billing_executions"("lastActorUserId");
CREATE INDEX "billing_executions_status_nextAttemptAt_idx" ON public."billing_executions"("status", "nextAttemptAt");
CREATE INDEX "billing_executions_pixStatus_idx" ON public."billing_executions"("pixStatus");
CREATE INDEX "billing_executions_deliveryStatus_idx" ON public."billing_executions"("deliveryStatus");
CREATE INDEX "billing_executions_reviewRequired_idx" ON public."billing_executions"("reviewRequired");
CREATE INDEX "billing_executions_leaseExpiresAt_idx" ON public."billing_executions"("leaseExpiresAt");
CREATE INDEX "billing_executions_createdAt_idx" ON public."billing_executions"("createdAt");

CREATE UNIQUE INDEX "billing_execution_receivables_execution_receivable_key"
  ON public."billing_execution_receivables"("billingExecutionId", "receivableId");
CREATE INDEX "billing_execution_receivables_billingExecutionId_idx"
  ON public."billing_execution_receivables"("billingExecutionId");
CREATE INDEX "billing_execution_receivables_receivableId_idx"
  ON public."billing_execution_receivables"("receivableId");
CREATE INDEX "billing_execution_receivables_clientReferenceId_idx"
  ON public."billing_execution_receivables"("clientReferenceId");
CREATE INDEX "billing_execution_receivables_dueDateSnapshot_idx"
  ON public."billing_execution_receivables"("dueDateSnapshot");

CREATE UNIQUE INDEX "billing_pix_attempts_paymentIntentId_key" ON public."billing_pix_attempts"("paymentIntentId");
CREATE UNIQUE INDEX "billing_pix_attempts_creationKey_key" ON public."billing_pix_attempts"("creationKey");
CREATE INDEX "billing_pix_attempts_execution_status_idx" ON public."billing_pix_attempts"("billingExecutionId", "status");
CREATE UNIQUE INDEX "billing_pix_attempts_provider_transaction_key"
  ON public."billing_pix_attempts"("provider", "providerTransactionId");
CREATE INDEX "billing_pix_attempts_execution_current_idx"
  ON public."billing_pix_attempts"("billingExecutionId", "isCurrent");
CREATE INDEX "billing_pix_attempts_reviewRequired_idx" ON public."billing_pix_attempts"("reviewRequired");
CREATE INDEX "billing_pix_attempts_createdAt_idx" ON public."billing_pix_attempts"("createdAt");
CREATE UNIQUE INDEX "billing_pix_attempts_one_active_per_execution_idx"
  ON public."billing_pix_attempts"("billingExecutionId")
  WHERE "status" IN ('RESERVED', 'CREATING', 'CONFIRMED', 'AMBIGUOUS');
CREATE UNIQUE INDEX "billing_pix_attempts_one_current_per_execution_idx"
  ON public."billing_pix_attempts"("billingExecutionId")
  WHERE "isCurrent";

CREATE INDEX "billing_execution_events_execution_created_idx"
  ON public."billing_execution_events"("billingExecutionId", "createdAt");
CREATE INDEX "billing_execution_events_eventType_idx" ON public."billing_execution_events"("eventType");
CREATE INDEX "billing_execution_events_actorType_idx" ON public."billing_execution_events"("actorType");
CREATE INDEX "billing_execution_events_actorUserId_idx" ON public."billing_execution_events"("actorUserId");

ALTER TABLE public."message_dispatches"
  ADD CONSTRAINT "message_dispatches_paymentIntentId_fkey"
  FOREIGN KEY ("paymentIntentId") REFERENCES public."payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_executions"
  ADD CONSTRAINT "billing_executions_messageDispatchId_fkey"
  FOREIGN KEY ("messageDispatchId") REFERENCES public."message_dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_executions"
  ADD CONSTRAINT "billing_executions_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES public."clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_executions"
  ADD CONSTRAINT "billing_executions_paymentIntentId_fkey"
  FOREIGN KEY ("paymentIntentId") REFERENCES public."payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_executions"
  ADD CONSTRAINT "billing_executions_supersedesExecutionId_fkey"
  FOREIGN KEY ("supersedesExecutionId") REFERENCES public."billing_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_executions"
  ADD CONSTRAINT "billing_executions_lastActorUserId_fkey"
  FOREIGN KEY ("lastActorUserId") REFERENCES public."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_execution_receivables"
  ADD CONSTRAINT "billing_execution_receivables_execution_fkey"
  FOREIGN KEY ("billingExecutionId") REFERENCES public."billing_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_execution_receivables"
  ADD CONSTRAINT "billing_execution_receivables_receivable_fkey"
  FOREIGN KEY ("receivableId") REFERENCES public."receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_execution_receivables"
  ADD CONSTRAINT "billing_execution_receivables_reference_fkey"
  FOREIGN KEY ("clientReferenceId") REFERENCES public."client_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_pix_attempts"
  ADD CONSTRAINT "billing_pix_attempts_execution_fkey"
  FOREIGN KEY ("billingExecutionId") REFERENCES public."billing_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_pix_attempts"
  ADD CONSTRAINT "billing_pix_attempts_paymentIntentId_fkey"
  FOREIGN KEY ("paymentIntentId") REFERENCES public."payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_execution_events"
  ADD CONSTRAINT "billing_execution_events_execution_fkey"
  FOREIGN KEY ("billingExecutionId") REFERENCES public."billing_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."billing_execution_events"
  ADD CONSTRAINT "billing_execution_events_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES public."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION public.billing_execution_validate_receivable_identity() RETURNS trigger AS $$
DECLARE
  execution_client UUID;
  receivable_client UUID;
  receivable_reference UUID;
  reference_client UUID;
BEGIN
  SELECT "clientId" INTO execution_client FROM public."billing_executions" WHERE "id" = NEW."billingExecutionId";
  SELECT "clientId", "clientReferenceId" INTO receivable_client, receivable_reference
    FROM public."receivables" WHERE "id" = NEW."receivableId";
  SELECT "clientId" INTO reference_client FROM public."client_references" WHERE "id" = NEW."clientReferenceId";

  IF execution_client IS NULL
    OR receivable_client IS DISTINCT FROM execution_client
    OR receivable_reference IS DISTINCT FROM NEW."clientReferenceId"
    OR reference_client IS DISTINCT FROM execution_client THEN
    RAISE EXCEPTION 'Billing execution receivable identity mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_execution_receivable_identity_trigger
BEFORE INSERT OR UPDATE ON public."billing_execution_receivables"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_validate_receivable_identity();

CREATE FUNCTION public.billing_execution_validate_payment_intent_links() RETURNS trigger AS $$
DECLARE
  execution_id UUID;
  execution_intent UUID;
  dispatch_id UUID;
  dispatch_intent UUID;
  intent_origin public."PaymentIntentOrigin";
  intent_creation_key TEXT;
BEGIN
  IF TG_TABLE_NAME = 'billing_executions' THEN
    execution_id := NEW."id";
  ELSIF TG_TABLE_NAME = 'billing_pix_attempts' THEN
    execution_id := NEW."billingExecutionId";
  ELSE
    SELECT "id" INTO execution_id
      FROM public."billing_executions" WHERE "messageDispatchId" = NEW."id";
  END IF;

  IF execution_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "paymentIntentId", "messageDispatchId"
    INTO execution_intent, dispatch_id
    FROM public."billing_executions" WHERE "id" = execution_id;
  SELECT "paymentIntentId" INTO dispatch_intent
    FROM public."message_dispatches" WHERE "id" = dispatch_id;

  IF execution_intent IS NULL THEN
    IF dispatch_intent IS NOT NULL OR EXISTS (
      SELECT 1 FROM public."billing_pix_attempts"
      WHERE "billingExecutionId" = execution_id AND "paymentIntentId" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Billing PaymentIntent link is incomplete' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "origin", "creationKey" INTO intent_origin, intent_creation_key
    FROM public."payment_intents" WHERE "id" = execution_intent;
  IF intent_origin IS DISTINCT FROM 'BILLING' OR intent_creation_key IS NULL THEN
    RAISE EXCEPTION 'Billing execution requires a BILLING PaymentIntent with creationKey'
      USING ERRCODE = '23514';
  END IF;
  IF dispatch_intent IS DISTINCT FROM execution_intent THEN
    RAISE EXCEPTION 'Billing execution and dispatch PaymentIntent mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."billing_pix_attempts"
    WHERE "billingExecutionId" = execution_id
      AND "paymentIntentId" IS NOT NULL
      AND "paymentIntentId" IS DISTINCT FROM execution_intent
  ) THEN
    RAISE EXCEPTION 'Billing execution and PIX attempt PaymentIntent mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE CONSTRAINT TRIGGER billing_execution_payment_intent_link_on_execution
AFTER INSERT OR UPDATE OF "paymentIntentId" ON public."billing_executions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_validate_payment_intent_links();

CREATE CONSTRAINT TRIGGER billing_execution_payment_intent_link_on_attempt
AFTER INSERT OR UPDATE OF "paymentIntentId", "billingExecutionId" ON public."billing_pix_attempts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_validate_payment_intent_links();

CREATE CONSTRAINT TRIGGER billing_execution_payment_intent_link_on_dispatch
AFTER INSERT OR UPDATE OF "paymentIntentId" ON public."message_dispatches"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_validate_payment_intent_links();

CREATE FUNCTION public.billing_execution_require_receivable_on_execution() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."billing_execution_receivables" WHERE "billingExecutionId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Billing execution requires at least one receivable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_execution_require_receivable_on_item() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."billing_executions" WHERE "id" = OLD."billingExecutionId")
    AND NOT EXISTS (
      SELECT 1 FROM public."billing_execution_receivables"
      WHERE "billingExecutionId" = OLD."billingExecutionId"
    ) THEN
    RAISE EXCEPTION 'Billing execution requires at least one receivable' USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE CONSTRAINT TRIGGER billing_execution_requires_receivable_on_execution
AFTER INSERT ON public."billing_executions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_require_receivable_on_execution();

CREATE CONSTRAINT TRIGGER billing_execution_requires_receivable_on_item
AFTER DELETE OR UPDATE OF "billingExecutionId" ON public."billing_execution_receivables"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_require_receivable_on_item();

CREATE FUNCTION public.billing_execution_validate_transitions() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'SCHEDULED' AND NEW."status" IN ('PROCESSING', 'BLOCKED', 'REVIEW_REQUIRED', 'CANCELED')) OR
    (OLD."status" = 'PROCESSING' AND NEW."status" IN ('WAITING_PIX', 'READY_TO_SEND', 'COMPLETED', 'BLOCKED', 'REVIEW_REQUIRED', 'CANCELED')) OR
    (OLD."status" = 'WAITING_PIX' AND NEW."status" IN ('READY_TO_SEND', 'BLOCKED', 'REVIEW_REQUIRED', 'CANCELED')) OR
    (OLD."status" = 'READY_TO_SEND' AND NEW."status" IN ('PROCESSING', 'COMPLETED', 'BLOCKED', 'REVIEW_REQUIRED', 'CANCELED')) OR
    (OLD."status" = 'BLOCKED' AND NEW."status" IN ('REVIEW_REQUIRED', 'CANCELED')) OR
    (OLD."status" = 'REVIEW_REQUIRED' AND NEW."status" IN ('SCHEDULED', 'WAITING_PIX', 'CANCELED'))
  ) THEN
    RAISE EXCEPTION 'Invalid BillingExecution status transition: % -> %', OLD."status", NEW."status"
      USING ERRCODE = '23514';
  END IF;

  IF OLD."pixStatus" IS DISTINCT FROM NEW."pixStatus" AND NOT (
    (OLD."pixStatus" = 'NOT_STARTED' AND NEW."pixStatus" IN ('RESERVED', 'CANCELED')) OR
    (OLD."pixStatus" = 'RESERVED' AND NEW."pixStatus" IN ('CREATING', 'FAILED', 'PAID', 'CANCELED')) OR
    (OLD."pixStatus" = 'CREATING' AND NEW."pixStatus" IN ('CONFIRMED', 'AMBIGUOUS', 'FAILED', 'PAID')) OR
    (OLD."pixStatus" = 'CONFIRMED' AND NEW."pixStatus" IN ('PAID', 'EXPIRED', 'CANCELED', 'SUPERSEDED')) OR
    (OLD."pixStatus" = 'AMBIGUOUS' AND NEW."pixStatus" IN ('CONFIRMED', 'FAILED', 'PAID', 'CANCELED', 'SUPERSEDED')) OR
    (OLD."pixStatus" = 'FAILED' AND NEW."pixStatus" IN ('RESERVED', 'PAID', 'CANCELED')) OR
    (OLD."pixStatus" = 'EXPIRED' AND NEW."pixStatus" IN ('PAID', 'SUPERSEDED', 'CANCELED')) OR
    (OLD."pixStatus" = 'SUPERSEDED' AND NEW."pixStatus" IN ('RESERVED', 'PAID', 'CANCELED')) OR
    (OLD."pixStatus" = 'CANCELED' AND NEW."pixStatus" = 'PAID')
  ) THEN
    RAISE EXCEPTION 'Invalid BillingExecution PIX transition: % -> %', OLD."pixStatus", NEW."pixStatus"
      USING ERRCODE = '23514';
  END IF;

  IF OLD."deliveryStatus" IS DISTINCT FROM NEW."deliveryStatus" AND NOT (
    (OLD."deliveryStatus" = 'NOT_READY' AND NEW."deliveryStatus" IN ('READY', 'CANCELED')) OR
    (OLD."deliveryStatus" = 'READY' AND NEW."deliveryStatus" IN ('SENDING', 'CANCELED')) OR
    (OLD."deliveryStatus" = 'SENDING' AND NEW."deliveryStatus" IN ('SENT', 'AMBIGUOUS', 'FAILED')) OR
    (OLD."deliveryStatus" = 'AMBIGUOUS' AND NEW."deliveryStatus" IN ('SENT', 'FAILED', 'CANCELED')) OR
    (OLD."deliveryStatus" = 'FAILED' AND NEW."deliveryStatus" IN ('READY', 'CANCELED'))
  ) THEN
    RAISE EXCEPTION 'Invalid BillingExecution delivery transition: % -> %', OLD."deliveryStatus", NEW."deliveryStatus"
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_execution_transition_trigger
BEFORE UPDATE ON public."billing_executions"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_validate_transitions();

CREATE FUNCTION public.billing_pix_attempt_validate_transition() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'RESERVED' AND NEW."status" IN ('CREATING', 'FAILED', 'PAID', 'CANCELED')) OR
    (OLD."status" = 'CREATING' AND NEW."status" IN ('CONFIRMED', 'AMBIGUOUS', 'FAILED', 'PAID')) OR
    (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('PAID', 'EXPIRED', 'CANCELED', 'SUPERSEDED')) OR
    (OLD."status" = 'AMBIGUOUS' AND NEW."status" IN ('CONFIRMED', 'FAILED', 'PAID', 'CANCELED', 'SUPERSEDED')) OR
    (OLD."status" = 'FAILED' AND NEW."status" IN ('RESERVED', 'PAID', 'CANCELED')) OR
    (OLD."status" = 'EXPIRED' AND NEW."status" IN ('PAID', 'SUPERSEDED', 'CANCELED')) OR
    (OLD."status" = 'SUPERSEDED' AND NEW."status" IN ('RESERVED', 'PAID', 'CANCELED')) OR
    (OLD."status" = 'CANCELED' AND NEW."status" = 'PAID')
  ) THEN
    RAISE EXCEPTION 'Invalid BillingPixAttempt transition: % -> %', OLD."status", NEW."status"
      USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'AMBIGUOUS' AND NEW."status" IS DISTINCT FROM OLD."status"
    AND (NEW."reconciledAt" IS NULL OR btrim(COALESCE(NEW."reconciliationEvidence", '')) = '') THEN
    RAISE EXCEPTION 'AMBIGUOUS Billing PIX requires explicit reconciliation evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_pix_attempt_transition_trigger
BEFORE UPDATE OF "status" ON public."billing_pix_attempts"
FOR EACH ROW EXECUTE FUNCTION public.billing_pix_attempt_validate_transition();

-- The exact receivable set is sealed by its SHA-256 hash. Child rows may be
-- inserted only inside the creation transaction; every commit recomputes the
-- complete set and rejects additions, removals or snapshot rewrites.
CREATE FUNCTION public.billing_execution_validate_exact_set(p_execution_id UUID) RETURNS void AS $$
DECLARE
  stored_client UUID;
  stored_cycle TEXT;
  stored_hash TEXT;
  stored_key TEXT;
  expected_hash TEXT;
  expected_key TEXT;
BEGIN
  SELECT "clientId", "cycleKey", "receivableSetHash", "executionKey"
    INTO stored_client, stored_cycle, stored_hash, stored_key
    FROM public."billing_executions" WHERE "id" = p_execution_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT encode(digest(string_agg(
      "receivableId"::text || '|' || "amountSnapshot"::numeric(12,2)::text || '|' || "dueDateSnapshot"::text,
      E'\n' ORDER BY "receivableId"::text
    ), 'sha256'), 'hex')
    INTO expected_hash
    FROM public."billing_execution_receivables" WHERE "billingExecutionId" = p_execution_id;
  IF expected_hash IS NULL THEN
    RAISE EXCEPTION 'Billing execution requires at least one receivable' USING ERRCODE = '23514';
  END IF;
  expected_key := 'billing-execution:v2:' || encode(
    digest(convert_to(stored_client::text || E'\n' || stored_cycle || E'\n' || expected_hash, 'UTF8'), 'sha256'),
    'hex'
  );
  IF stored_hash IS DISTINCT FROM expected_hash OR stored_key IS DISTINCT FROM expected_key THEN
    RAISE EXCEPTION 'Billing execution exact receivable set identity mismatch' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public."billing_execution_receivables" own_item
    JOIN public."billing_execution_receivables" other_item
      ON other_item."receivableId" = own_item."receivableId"
     AND other_item."billingExecutionId" <> own_item."billingExecutionId"
    JOIN public."billing_executions" other_execution ON other_execution."id" = other_item."billingExecutionId"
    JOIN public."billing_executions" own_execution ON own_execution."id" = own_item."billingExecutionId"
    WHERE own_item."billingExecutionId" = p_execution_id
      AND own_execution."isCurrent" AND other_execution."isCurrent"
  ) THEN
    RAISE EXCEPTION 'Receivable cannot belong to multiple current Billing executions'
      USING ERRCODE = '23505';
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_execution_exact_set_on_execution() RETURNS trigger AS $$
BEGIN
  PERFORM public.billing_execution_validate_exact_set(NEW."id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_execution_exact_set_on_item() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Billing execution receivable snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  PERFORM public.billing_execution_validate_exact_set(NEW."billingExecutionId");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_execution_identity_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."clientId" IS DISTINCT FROM NEW."clientId"
    OR OLD."messageDispatchId" IS DISTINCT FROM NEW."messageDispatchId"
    OR OLD."cycleKey" IS DISTINCT FROM NEW."cycleKey"
    OR OLD."receivableSetHash" IS DISTINCT FROM NEW."receivableSetHash"
    OR OLD."executionKey" IS DISTINCT FROM NEW."executionKey" THEN
    RAISE EXCEPTION 'Billing execution financial identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_execution_identity_immutable_trigger
BEFORE UPDATE OF "messageDispatchId", "clientId", "cycleKey", "receivableSetHash", "executionKey" ON public."billing_executions"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_identity_immutable();

CREATE FUNCTION public.billing_execution_reject_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Billing financial records are immutable and cannot be deleted'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_execution_reject_delete_trigger
BEFORE DELETE ON public."billing_executions"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_reject_delete();

CREATE TRIGGER billing_execution_receivable_reject_delete_trigger
BEFORE DELETE ON public."billing_execution_receivables"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_reject_delete();

CREATE TRIGGER billing_pix_attempt_reject_delete_trigger
BEFORE DELETE ON public."billing_pix_attempts"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_reject_delete();

CREATE TRIGGER billing_execution_receivable_immutable_trigger
BEFORE UPDATE ON public."billing_execution_receivables"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_exact_set_on_item();

CREATE CONSTRAINT TRIGGER billing_execution_exact_set_on_execution_trigger
AFTER INSERT OR UPDATE OF "clientId", "cycleKey", "receivableSetHash", "executionKey" ON public."billing_executions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_exact_set_on_execution();

CREATE CONSTRAINT TRIGGER billing_execution_exact_set_on_item_trigger
AFTER INSERT ON public."billing_execution_receivables"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_exact_set_on_item();

-- Reverse identity changes are forbidden once a receivable participates in an
-- execution. Status remains mutable so real payments/cancellations can proceed.
CREATE FUNCTION public.billing_execution_protect_receivable_identity() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
      SELECT 1 FROM public."billing_execution_receivables" ber
      JOIN public."billing_executions" e ON e."id" = ber."billingExecutionId"
      WHERE ber."receivableId" = OLD."id" AND e."isCurrent"
    )
    AND (OLD."clientId" IS DISTINCT FROM NEW."clientId"
      OR OLD."clientReferenceId" IS DISTINCT FROM NEW."clientReferenceId"
      OR OLD."amount" IS DISTINCT FROM NEW."amount"
      OR OLD."dueDate" IS DISTINCT FROM NEW."dueDate") THEN
    RAISE EXCEPTION 'Receivable identity is sealed by BillingExecution' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_execution_receivable_source_immutable_trigger
BEFORE UPDATE OF "clientId", "clientReferenceId", "amount", "dueDate" ON public."receivables"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_protect_receivable_identity();

CREATE FUNCTION public.billing_execution_protect_reference_identity() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
      SELECT 1 FROM public."billing_execution_receivables" ber
      JOIN public."billing_executions" e ON e."id" = ber."billingExecutionId"
      WHERE ber."clientReferenceId" = OLD."id" AND e."isCurrent"
    )
    AND (OLD."clientId" IS DISTINCT FROM NEW."clientId" OR OLD."reference" IS DISTINCT FROM NEW."reference") THEN
    RAISE EXCEPTION 'Client reference identity is sealed by BillingExecution' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_execution_reference_source_immutable_trigger
BEFORE UPDATE OF "clientId", "reference" ON public."client_references"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_protect_reference_identity();

-- Validate the complete PaymentIntent identity, including exact receivable set
-- and amount. This is deferred so execution, attempt and dispatch can be linked
-- atomically in any statement order.
CREATE FUNCTION public.billing_execution_validate_financial_links(p_execution_id UUID) RETURNS void AS $$
DECLARE
  execution_intent UUID;
  dispatch_intent UUID;
  execution_client UUID;
  execution_cycle TEXT;
  dispatch_client UUID;
  dispatch_reference UUID;
  dispatch_receivable UUID;
  dispatch_origin public."MessageDispatchOrigin";
  dispatch_status public."MessageDispatchStatus";
  dispatch_provider_message_id TEXT;
  dispatch_sent_at TIMESTAMP(3);
  intent_origin public."PaymentIntentOrigin";
  intent_status public."PaymentIntentStatus";
  intent_creation_key TEXT;
  intent_receivable UUID;
  intent_group UUID;
  intent_amount NUMERIC(12,2);
  intent_provider public."PaymentProviderCode";
  intent_provider_transaction_id TEXT;
  attempt_provider public."PaymentProviderCode";
  attempt_provider_transaction_id TEXT;
  snapshot_amount NUMERIC(12,2);
  execution_count INTEGER;
  intent_count INTEGER;
  current_count INTEGER;
  current_status public."BillingPixStatus";
  execution_pix public."BillingPixStatus";
  execution_status public."BillingExecutionStatus";
  delivery_status public."BillingDeliveryStatus";
BEGIN
  SELECT e."paymentIntentId", d."paymentIntentId", e."clientId", e."cycleKey",
         e."pixStatus", e."status", e."deliveryStatus", d."clientId", d."clientReferenceId",
         d."receivableId", d."origin", d."status", d."providerMessageId", d."sentAt"
    INTO execution_intent, dispatch_intent, execution_client, execution_cycle,
         execution_pix, execution_status, delivery_status, dispatch_client, dispatch_reference,
         dispatch_receivable, dispatch_origin, dispatch_status, dispatch_provider_message_id, dispatch_sent_at
    FROM public."billing_executions" e
    JOIN public."message_dispatches" d ON d."id" = e."messageDispatchId"
    WHERE e."id" = p_execution_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF dispatch_client IS DISTINCT FROM execution_client OR dispatch_origin <> 'BILLING' THEN
    RAISE EXCEPTION 'Billing execution dispatch identity mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), COALESCE(sum("amountSnapshot"), 0)
    INTO execution_count, snapshot_amount
    FROM public."billing_execution_receivables" WHERE "billingExecutionId" = p_execution_id;
  IF EXISTS (
    SELECT 1 FROM public."billing_execution_receivables"
    WHERE "billingExecutionId" = p_execution_id
      AND to_char("dueDateSnapshot", 'YYYY-MM') IS DISTINCT FROM execution_cycle
  ) THEN
    RAISE EXCEPTION 'Billing execution cycle does not match receivable due dates' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public."message_dispatch_items" WHERE "messageDispatchId" = (
      SELECT "messageDispatchId" FROM public."billing_executions" WHERE "id" = p_execution_id
    )) THEN
    IF EXISTS (
      (SELECT "receivableId" FROM public."message_dispatch_items" WHERE "messageDispatchId" = (
         SELECT "messageDispatchId" FROM public."billing_executions" WHERE "id" = p_execution_id)
       EXCEPT SELECT "receivableId" FROM public."billing_execution_receivables" WHERE "billingExecutionId" = p_execution_id)
      UNION ALL
      (SELECT "receivableId" FROM public."billing_execution_receivables" WHERE "billingExecutionId" = p_execution_id
       EXCEPT SELECT "receivableId" FROM public."message_dispatch_items" WHERE "messageDispatchId" = (
         SELECT "messageDispatchId" FROM public."billing_executions" WHERE "id" = p_execution_id))
    ) THEN
      RAISE EXCEPTION 'Billing dispatch receivable set does not match execution set' USING ERRCODE = '23514';
    END IF;
  ELSIF execution_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM public."billing_execution_receivables"
    WHERE "billingExecutionId" = p_execution_id
      AND "receivableId" = dispatch_receivable
      AND "clientReferenceId" = dispatch_reference
  ) THEN
    RAISE EXCEPTION 'Billing dispatch receivable identity does not match execution set' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO current_count
    FROM public."billing_pix_attempts" WHERE "billingExecutionId" = p_execution_id AND "isCurrent";
  SELECT "status" INTO current_status
    FROM public."billing_pix_attempts" WHERE "billingExecutionId" = p_execution_id AND "isCurrent"
    LIMIT 1;
  SELECT "provider", "providerTransactionId"
    INTO attempt_provider, attempt_provider_transaction_id
    FROM public."billing_pix_attempts"
    WHERE "billingExecutionId" = p_execution_id AND "isCurrent"
    LIMIT 1;

  IF execution_pix = 'NOT_STARTED' OR (execution_pix = 'CANCELED' AND current_count = 0) THEN
    IF execution_intent IS NOT NULL OR dispatch_intent IS NOT NULL OR current_count <> 0 THEN
      RAISE EXCEPTION 'Billing execution without a PIX attempt cannot have PIX links' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF current_count <> 1 OR current_status IS DISTINCT FROM execution_pix THEN
      RAISE EXCEPTION 'Billing execution PIX status must match its current attempt' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF execution_status <> 'REVIEW_REQUIRED'
    AND execution_pix IN ('RESERVED','CREATING','CONFIRMED','AMBIGUOUS') AND EXISTS (
    SELECT 1 FROM public."billing_execution_receivables" ber
    JOIN public."receivables" r ON r."id" = ber."receivableId"
    WHERE ber."billingExecutionId" = p_execution_id AND r."status" <> 'PENDENTE'
  ) THEN
    RAISE EXCEPTION 'Paid or canceled receivable cannot have a new Billing PIX reservation'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (SELECT 1 FROM public."billing_pix_attempts" WHERE "billingExecutionId" = p_execution_id AND "status" = 'PAID')
    AND EXISTS (SELECT 1 FROM public."billing_pix_attempts" WHERE "billingExecutionId" = p_execution_id AND "status" <> 'PAID' AND "isCurrent") THEN
    RAISE EXCEPTION 'A paid Billing PIX cannot be replaced by another attempt' USING ERRCODE = '23514';
  END IF;

  IF execution_intent IS NULL THEN
    IF dispatch_intent IS NOT NULL OR EXISTS (
      SELECT 1 FROM public."billing_pix_attempts" WHERE "billingExecutionId" = p_execution_id AND "paymentIntentId" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Billing PaymentIntent link is incomplete' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT "origin", "status", "creationKey", "receivableId", "paymentGroupId", "amount",
           "provider", "providerTransactionId"
      INTO intent_origin, intent_status, intent_creation_key, intent_receivable, intent_group, intent_amount,
           intent_provider, intent_provider_transaction_id
      FROM public."payment_intents" WHERE "id" = execution_intent;
    IF intent_origin IS DISTINCT FROM 'BILLING' OR intent_creation_key IS NULL THEN
      RAISE EXCEPTION 'Billing execution requires a BILLING PaymentIntent with creationKey' USING ERRCODE = '23514';
    END IF;
    IF dispatch_intent IS DISTINCT FROM execution_intent OR EXISTS (
      SELECT 1 FROM public."billing_pix_attempts"
      WHERE "billingExecutionId" = p_execution_id AND "isCurrent"
        AND "paymentIntentId" IS DISTINCT FROM execution_intent
    ) THEN
      RAISE EXCEPTION 'Billing PaymentIntent links must identify one intent' USING ERRCODE = '23514';
    END IF;
    IF intent_amount IS DISTINCT FROM snapshot_amount THEN
      RAISE EXCEPTION 'Billing PaymentIntent amount does not match execution snapshots' USING ERRCODE = '23514';
    END IF;
    IF attempt_provider IS NOT NULL AND intent_provider IS DISTINCT FROM attempt_provider THEN
      RAISE EXCEPTION 'Billing PIX provider does not match PaymentIntent provider' USING ERRCODE = '23514';
    END IF;
    IF attempt_provider_transaction_id IS NOT NULL
      AND intent_provider_transaction_id IS DISTINCT FROM attempt_provider_transaction_id THEN
      RAISE EXCEPTION 'Billing PIX provider transaction does not match PaymentIntent'
        USING ERRCODE = '23514';
    END IF;
    IF (intent_receivable IS NULL) = (intent_group IS NULL) THEN
      RAISE EXCEPTION 'Billing PaymentIntent must identify one receivable or one payment group' USING ERRCODE = '23514';
    END IF;
    IF intent_receivable IS NOT NULL THEN
      IF execution_count <> 1 OR NOT EXISTS (
        SELECT 1 FROM public."billing_execution_receivables"
        WHERE "billingExecutionId" = p_execution_id AND "receivableId" = intent_receivable
      ) THEN
        RAISE EXCEPTION 'Billing PaymentIntent receivable does not match execution set' USING ERRCODE = '23514';
      END IF;
    ELSE
      SELECT count(*) INTO intent_count FROM public."payment_group_items" WHERE "paymentGroupId" = intent_group;
      IF intent_count <> execution_count OR EXISTS (
        (SELECT "receivableId" FROM public."payment_group_items" WHERE "paymentGroupId" = intent_group
         EXCEPT SELECT "receivableId" FROM public."billing_execution_receivables" WHERE "billingExecutionId" = p_execution_id)
        UNION ALL
        (SELECT "receivableId" FROM public."billing_execution_receivables" WHERE "billingExecutionId" = p_execution_id
         EXCEPT SELECT "receivableId" FROM public."payment_group_items" WHERE "paymentGroupId" = intent_group)
      ) OR NOT EXISTS (
        SELECT 1 FROM public."payment_groups" WHERE "id" = intent_group
          AND "clientId" = execution_client AND "totalAmount" = snapshot_amount
      ) THEN
        RAISE EXCEPTION 'Billing PaymentIntent group does not match execution set' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF delivery_status IN ('READY', 'SENDING', 'SENT', 'AMBIGUOUS', 'FAILED')
    AND (execution_pix NOT IN ('CONFIRMED', 'PAID') OR execution_intent IS NULL) THEN
    RAISE EXCEPTION 'Billing delivery requires a confirmed PIX' USING ERRCODE = '23514';
  END IF;
  IF execution_pix IN ('CONFIRMED', 'PAID') AND execution_intent IS NULL THEN
    RAISE EXCEPTION 'Confirmed or paid Billing PIX requires a PaymentIntent' USING ERRCODE = '23514';
  END IF;
  IF execution_pix = 'CONFIRMED' AND intent_status NOT IN ('WAITING_PAYMENT', 'PAID') THEN
    RAISE EXCEPTION 'Confirmed Billing PIX requires a waiting or paid PaymentIntent'
      USING ERRCODE = '23514';
  END IF;
  IF execution_pix = 'PAID' AND NOT EXISTS (
    SELECT 1 FROM public."payment_intents" WHERE "id" = execution_intent AND "status" = 'PAID'
  ) THEN
    RAISE EXCEPTION 'Paid Billing PIX requires a paid PaymentIntent' USING ERRCODE = '23514';
  END IF;
  IF intent_status = 'PAID' AND execution_pix <> 'PAID' THEN
    RAISE EXCEPTION 'Paid PaymentIntent requires paid Billing PIX state' USING ERRCODE = '23514';
  END IF;
  IF intent_status IN ('CANCELED','EXPIRED','FAILED','SUPERSEDED')
    AND execution_pix::text IS DISTINCT FROM intent_status::text THEN
    RAISE EXCEPTION 'Terminal PaymentIntent state must match Billing PIX state' USING ERRCODE = '23514';
  END IF;
  IF intent_status = 'REFUNDED'
    AND (execution_status <> 'REVIEW_REQUIRED' OR NOT EXISTS (
      SELECT 1 FROM public."billing_executions" WHERE "id" = p_execution_id AND "reviewRequired"
    )) THEN
    RAISE EXCEPTION 'Refunded PaymentIntent requires Billing review' USING ERRCODE = '23514';
  END IF;
  IF execution_status = 'READY_TO_SEND'
    AND (execution_pix <> 'CONFIRMED' OR delivery_status <> 'READY') THEN
    RAISE EXCEPTION 'READY_TO_SEND requires confirmed PIX and ready delivery' USING ERRCODE = '23514';
  END IF;
  IF execution_status = 'COMPLETED' AND delivery_status <> 'SENT' THEN
    RAISE EXCEPTION 'COMPLETED billing execution requires SENT delivery' USING ERRCODE = '23514';
  END IF;
  IF delivery_status = 'SENT' AND (
    dispatch_status <> 'SENT' OR dispatch_provider_message_id IS NULL OR dispatch_sent_at IS NULL
  ) THEN
    RAISE EXCEPTION 'SENT Billing delivery requires persisted provider send evidence'
      USING ERRCODE = '23514';
  END IF;
  IF delivery_status = 'SENT' AND execution_status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'SENT billing delivery requires COMPLETED execution' USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_execution_validate_financial_links_trigger() RETURNS trigger AS $$
DECLARE execution_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'billing_executions' THEN execution_id := NEW."id";
  ELSIF TG_TABLE_NAME = 'billing_pix_attempts' THEN execution_id := COALESCE(NEW."billingExecutionId", OLD."billingExecutionId");
  ELSE SELECT "id" INTO execution_id FROM public."billing_executions" WHERE "messageDispatchId" = NEW."id";
  END IF;
  IF execution_id IS NOT NULL THEN PERFORM public.billing_execution_validate_financial_links(execution_id); END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE CONSTRAINT TRIGGER billing_execution_financial_links_on_execution
AFTER INSERT OR UPDATE ON public."billing_executions" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_validate_financial_links_trigger();
CREATE CONSTRAINT TRIGGER billing_execution_financial_links_on_attempt
AFTER INSERT OR UPDATE OR DELETE ON public."billing_pix_attempts" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_validate_financial_links_trigger();
CREATE CONSTRAINT TRIGGER billing_execution_financial_links_on_dispatch
AFTER UPDATE OF "paymentIntentId" ON public."message_dispatches" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_validate_financial_links_trigger();

CREATE FUNCTION public.billing_execution_revalidate_related() RETURNS trigger AS $$
DECLARE execution_record RECORD;
BEGIN
  IF TG_TABLE_NAME = 'payment_intents' THEN
    FOR execution_record IN
      SELECT DISTINCT e."id"
      FROM public."billing_executions" e
      LEFT JOIN public."billing_pix_attempts" a ON a."billingExecutionId" = e."id"
      WHERE e."isCurrent" AND (e."paymentIntentId" = NEW."id" OR a."paymentIntentId" = NEW."id")
    LOOP
      PERFORM public.billing_execution_validate_financial_links(execution_record."id");
    END LOOP;
  ELSIF TG_TABLE_NAME = 'receivables' THEN
    FOR execution_record IN
      SELECT DISTINCT e."id"
      FROM public."billing_executions" e
      JOIN public."billing_execution_receivables" ber ON ber."billingExecutionId" = e."id"
      WHERE e."isCurrent" AND ber."receivableId" = NEW."id"
    LOOP
      PERFORM public.billing_execution_validate_financial_links(execution_record."id");
    END LOOP;
  ELSE
    FOR execution_record IN
      SELECT e."id" FROM public."billing_executions" e
      WHERE e."isCurrent" AND e."messageDispatchId" = NEW."id"
    LOOP
      PERFORM public.billing_execution_validate_financial_links(execution_record."id");
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE CONSTRAINT TRIGGER billing_execution_financial_links_on_intent_change
AFTER UPDATE OF "status", "provider", "providerTransactionId", "receivableId", "paymentGroupId", "amount", "origin", "creationKey"
ON public."payment_intents" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_revalidate_related();

CREATE CONSTRAINT TRIGGER billing_execution_financial_links_on_receivable_status
AFTER UPDATE OF "status" ON public."receivables" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_revalidate_related();

CREATE CONSTRAINT TRIGGER billing_execution_financial_links_on_dispatch_identity
AFTER UPDATE OF "clientId", "clientReferenceId", "receivableId", "origin", "status", "providerMessageId", "sentAt"
ON public."message_dispatches" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_revalidate_related();

CREATE FUNCTION public.billing_payment_intent_reconcile_paid() RETURNS trigger AS $$
DECLARE execution_record RECORD;
BEGIN
  IF NEW."status" = 'PAID' AND OLD."status" IS DISTINCT FROM NEW."status" THEN
    FOR execution_record IN
      SELECT e."id", e."pixStatus"
      FROM public."billing_executions" e
      LEFT JOIN public."billing_pix_attempts" a ON a."billingExecutionId" = e."id" AND a."isCurrent"
      WHERE e."isCurrent" AND (e."paymentIntentId" = NEW."id" OR a."paymentIntentId" = NEW."id")
      FOR UPDATE OF e
    LOOP
      UPDATE public."billing_executions"
      SET "pixStatus" = 'PAID', "lastActorType" = 'SYSTEM', "lastActorUserId" = NULL,
          "lastMutationReason" = 'PaymentIntent pago reconciliado atomicamente.',
          "reviewRequired" = CASE WHEN execution_record."pixStatus" <> 'CONFIRMED' THEN true ELSE "reviewRequired" END,
          "blockedCode" = CASE WHEN execution_record."pixStatus" <> 'CONFIRMED' THEN 'PAID_INTENT_RECONCILIATION' ELSE "blockedCode" END,
          "blockedReason" = CASE WHEN execution_record."pixStatus" <> 'CONFIRMED'
            THEN 'Pagamento confirmado fora da sequencia esperada; revisao obrigatoria.' ELSE "blockedReason" END,
          "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = execution_record."id";
      UPDATE public."billing_pix_attempts"
      SET "status" = 'PAID',
          "reconciledAt" = CASE WHEN "status" = 'AMBIGUOUS' THEN CURRENT_TIMESTAMP ELSE "reconciledAt" END,
          "reconciliationEvidence" = CASE WHEN "status" = 'AMBIGUOUS'
            THEN 'PaymentIntent persistido como PAID.' ELSE "reconciliationEvidence" END,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "billingExecutionId" = execution_record."id" AND "isCurrent";
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_payment_intent_reconcile_paid_trigger
BEFORE UPDATE OF "status" ON public."payment_intents"
FOR EACH ROW EXECUTE FUNCTION public.billing_payment_intent_reconcile_paid();

CREATE FUNCTION public.billing_receivable_reconcile_terminal_status() RETURNS trigger AS $$
DECLARE execution_record RECORD;
BEGIN
  IF NEW."status" IN ('PAGO','CANCELADO') AND OLD."status" IS DISTINCT FROM NEW."status" THEN
    FOR execution_record IN
      SELECT e."id", e."status", e."pixStatus", e."deliveryStatus"
      FROM public."billing_executions" e
      JOIN public."billing_execution_receivables" ber ON ber."billingExecutionId" = e."id"
      WHERE e."isCurrent" AND ber."receivableId" = NEW."id"
      FOR UPDATE OF e
    LOOP
      IF execution_record."pixStatus" IN ('NOT_STARTED','RESERVED')
        AND execution_record."deliveryStatus" IN ('NOT_READY','READY') THEN
        UPDATE public."billing_executions"
        SET "status" = 'CANCELED', "pixStatus" = 'CANCELED', "deliveryStatus" = 'CANCELED',
            "lastActorType" = 'SYSTEM', "lastActorUserId" = NULL,
            "lastMutationReason" = 'Recebivel terminal invalidou a cobranca antes de atividade remota.',
            "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = execution_record."id";
        UPDATE public."billing_pix_attempts"
        SET "status" = 'CANCELED', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "billingExecutionId" = execution_record."id" AND "isCurrent" AND "status" = 'RESERVED';
      ELSIF execution_record."status" NOT IN ('COMPLETED','CANCELED','REVIEW_REQUIRED') THEN
        UPDATE public."billing_executions"
        SET "status" = 'REVIEW_REQUIRED', "reviewRequired" = true,
            "blockedCode" = 'PAYMENT_RECONCILIATION_REQUIRED',
            "blockedReason" = 'Recebivel alterado durante atividade PIX; reconciliacao obrigatoria.',
            "lastActorType" = 'SYSTEM', "lastActorUserId" = NULL,
            "lastMutationReason" = 'Recebivel terminal detectado durante atividade PIX.',
            "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = execution_record."id";
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_receivable_reconcile_terminal_status_trigger
BEFORE UPDATE OF "status" ON public."receivables"
FOR EACH ROW EXECUTE FUNCTION public.billing_receivable_reconcile_terminal_status();

CREATE FUNCTION public.billing_pix_attempt_identity_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."billingExecutionId" IS DISTINCT FROM NEW."billingExecutionId"
    OR OLD."creationKey" IS DISTINCT FROM NEW."creationKey"
    OR (OLD."paymentIntentId" IS NOT NULL AND OLD."paymentIntentId" IS DISTINCT FROM NEW."paymentIntentId")
    OR (OLD."providerTransactionId" IS NOT NULL AND OLD."providerTransactionId" IS DISTINCT FROM NEW."providerTransactionId")
    OR (NOT OLD."isCurrent" AND NEW."isCurrent") THEN
    RAISE EXCEPTION 'Billing PIX attempt identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER billing_pix_attempt_identity_immutable_trigger
BEFORE UPDATE ON public."billing_pix_attempts"
FOR EACH ROW EXECUTE FUNCTION public.billing_pix_attempt_identity_immutable();

CREATE FUNCTION public.billing_payment_intent_identity_immutable() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."billing_executions" WHERE "paymentIntentId" = OLD."id")
    AND (OLD."receivableId" IS DISTINCT FROM NEW."receivableId"
      OR OLD."paymentGroupId" IS DISTINCT FROM NEW."paymentGroupId"
      OR OLD."amount" IS DISTINCT FROM NEW."amount"
      OR OLD."origin" IS DISTINCT FROM NEW."origin"
      OR OLD."creationKey" IS DISTINCT FROM NEW."creationKey"
      OR OLD."provider" IS DISTINCT FROM NEW."provider"
      OR (OLD."providerTransactionId" IS NOT NULL AND OLD."providerTransactionId" IS DISTINCT FROM NEW."providerTransactionId")) THEN
    RAISE EXCEPTION 'Billing PaymentIntent financial identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER billing_payment_intent_identity_immutable_trigger
BEFORE UPDATE ON public."payment_intents"
FOR EACH ROW EXECUTE FUNCTION public.billing_payment_intent_identity_immutable();

CREATE FUNCTION public.billing_payment_group_items_immutable() RETURNS trigger AS $$
DECLARE group_id UUID := COALESCE(NEW."paymentGroupId", OLD."paymentGroupId");
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."payment_intents" pi JOIN public."billing_executions" e ON e."paymentIntentId" = pi."id"
    WHERE pi."paymentGroupId" = group_id
  ) THEN
    RAISE EXCEPTION 'Billing PaymentIntent group items are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER billing_payment_group_items_immutable_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public."payment_group_items"
FOR EACH ROW EXECUTE FUNCTION public.billing_payment_group_items_immutable();

CREATE FUNCTION public.billing_payment_group_identity_immutable() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."payment_intents" pi JOIN public."billing_executions" e ON e."paymentIntentId" = pi."id"
    WHERE pi."paymentGroupId" = OLD."id"
  ) AND (OLD."clientId" IS DISTINCT FROM NEW."clientId" OR OLD."totalAmount" IS DISTINCT FROM NEW."totalAmount") THEN
    RAISE EXCEPTION 'Billing PaymentIntent group identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER billing_payment_group_identity_immutable_trigger
BEFORE UPDATE OF "clientId", "totalAmount" ON public."payment_groups"
FOR EACH ROW EXECUTE FUNCTION public.billing_payment_group_identity_immutable();

-- Every state transition writes an immutable SYSTEM event in the same database
-- transaction. Direct event insertion is rejected to prevent fabricated history.
CREATE FUNCTION public.billing_execution_event_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') OR pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Billing execution events are immutable and trigger-generated' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER billing_execution_event_guard_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public."billing_execution_events"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_event_guard();

CREATE FUNCTION public.billing_execution_write_events() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public."billing_execution_events" ("id", "billingExecutionId", "eventType", "actorType", "actorUserId", "origin", "reason", "metadata")
    VALUES (gen_random_uuid(), NEW."id", 'EXECUTION_CREATED', NEW."lastActorType", NEW."lastActorUserId", 'BILLING',
      NEW."lastMutationReason", jsonb_build_object('component','billing-data-foundation'));
  ELSE
    IF OLD."status" IS DISTINCT FROM NEW."status" THEN
      INSERT INTO public."billing_execution_events" VALUES
        (gen_random_uuid(), NEW."id", 'EXECUTION_STATUS_CHANGED', NEW."lastActorType", NEW."lastActorUserId", 'BILLING', NEW."lastMutationReason",
         jsonb_build_object('from',OLD."status",'to',NEW."status",'component','billing-data-foundation'), CURRENT_TIMESTAMP);
    END IF;
    IF OLD."pixStatus" IS DISTINCT FROM NEW."pixStatus" THEN
      INSERT INTO public."billing_execution_events" VALUES
        (gen_random_uuid(), NEW."id", 'PIX_STATUS_CHANGED', NEW."lastActorType", NEW."lastActorUserId", 'BILLING', NEW."lastMutationReason",
         jsonb_build_object('from',OLD."pixStatus",'to',NEW."pixStatus",'component','billing-data-foundation'), CURRENT_TIMESTAMP);
    END IF;
    IF OLD."deliveryStatus" IS DISTINCT FROM NEW."deliveryStatus" THEN
      INSERT INTO public."billing_execution_events" VALUES
        (gen_random_uuid(), NEW."id", 'DELIVERY_STATUS_CHANGED', NEW."lastActorType", NEW."lastActorUserId", 'BILLING', NEW."lastMutationReason",
         jsonb_build_object('from',OLD."deliveryStatus",'to',NEW."deliveryStatus",'component','billing-data-foundation'), CURRENT_TIMESTAMP);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER billing_execution_write_events_trigger
AFTER INSERT OR UPDATE OF "status", "pixStatus", "deliveryStatus" ON public."billing_executions"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_write_events();

CREATE FUNCTION public.billing_pix_attempt_write_events() RETURNS trigger AS $$
DECLARE
  event_actor public."BillingActorType";
  event_user UUID;
  event_reason TEXT;
BEGIN
  SELECT "lastActorType", "lastActorUserId", "lastMutationReason"
    INTO event_actor, event_user, event_reason
    FROM public."billing_executions" WHERE "id" = NEW."billingExecutionId";
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public."billing_execution_events" ("id", "billingExecutionId", "eventType", "actorType", "actorUserId", "origin", "reason", "metadata")
    VALUES (gen_random_uuid(), NEW."billingExecutionId", 'PIX_ATTEMPT_RESERVED', event_actor, event_user, 'BILLING', event_reason,
      jsonb_build_object('attemptId',NEW."id",'status',NEW."status",'component','billing-data-foundation'));
  ELSIF OLD."status" IS DISTINCT FROM NEW."status" THEN
    INSERT INTO public."billing_execution_events" ("id", "billingExecutionId", "eventType", "actorType", "actorUserId", "origin", "reason", "metadata")
    VALUES (gen_random_uuid(), NEW."billingExecutionId", 'PIX_STATUS_CHANGED', event_actor, event_user, 'BILLING', event_reason,
      jsonb_build_object('attemptId',NEW."id",'from',OLD."status",'to',NEW."status",'component','billing-data-foundation'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER billing_pix_attempt_write_events_trigger
AFTER INSERT OR UPDATE OF "status" ON public."billing_pix_attempts"
FOR EACH ROW EXECUTE FUNCTION public.billing_pix_attempt_write_events();

-- Optimistic versioning is mandatory for workflow mutations. Lease columns are
-- writable only through the atomic functions defined below.
CREATE FUNCTION public.billing_execution_guard_version_and_lease() RETURNS trigger AS $$
BEGIN
  IF (OLD."leaseOwner", OLD."leaseToken", OLD."leaseExpiresAt") IS DISTINCT FROM
     (NEW."leaseOwner", NEW."leaseToken", NEW."leaseExpiresAt")
    AND pg_catalog.current_setting('crm.billing_lease_mutation', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'Billing execution lease must use atomic lease functions' USING ERRCODE = '23514';
  END IF;
  IF (OLD."status", OLD."pixStatus", OLD."deliveryStatus", OLD."paymentIntentId", OLD."nextAttemptAt",
      OLD."blockedCode", OLD."blockedReason", OLD."reviewRequired") IS DISTINCT FROM
     (NEW."status", NEW."pixStatus", NEW."deliveryStatus", NEW."paymentIntentId", NEW."nextAttemptAt",
      NEW."blockedCode", NEW."blockedReason", NEW."reviewRequired")
    AND NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Billing execution workflow mutation requires version compare-and-swap' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER billing_execution_guard_version_and_lease_trigger
BEFORE UPDATE ON public."billing_executions"
FOR EACH ROW EXECUTE FUNCTION public.billing_execution_guard_version_and_lease();

-- Lease functions are worker-coordination capabilities, not actor-authored financial mutations.
-- Their owner/token CAS cannot reserve PIX, change workflow state or amend a receivable without
-- a separate operation-bound HMAC assertion in the privileged mutation function.
CREATE FUNCTION public.billing_execution_acquire_lease(p_id UUID, p_owner TEXT, p_token TEXT, p_ttl_seconds INTEGER)
RETURNS BOOLEAN AS $$
DECLARE changed INTEGER;
BEGIN
  IF btrim(p_owner) = '' OR btrim(p_token) = '' OR p_ttl_seconds < 1 OR p_ttl_seconds > 900 THEN
    RAISE EXCEPTION 'Invalid BillingExecution lease request' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('crm.billing_lease_mutation', 'allowed', true);
  UPDATE public."billing_executions"
    SET "leaseOwner" = btrim(p_owner), "leaseToken" = btrim(p_token),
        "leaseExpiresAt" = clock_timestamp() + make_interval(secs => p_ttl_seconds),
        "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_id
      AND "status" IN ('SCHEDULED','PROCESSING','WAITING_PIX','READY_TO_SEND','REVIEW_REQUIRED')
      AND ("leaseToken" IS NULL OR "leaseExpiresAt" <= clock_timestamp());
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM pg_catalog.set_config('crm.billing_lease_mutation', '', true);
  RETURN changed = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_execution_renew_lease(p_id UUID, p_owner TEXT, p_token TEXT, p_ttl_seconds INTEGER)
RETURNS BOOLEAN AS $$
DECLARE changed INTEGER;
BEGIN
  IF p_ttl_seconds < 1 OR p_ttl_seconds > 900 THEN
    RAISE EXCEPTION 'Invalid BillingExecution lease renewal' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('crm.billing_lease_mutation', 'allowed', true);
  UPDATE public."billing_executions"
    SET "leaseExpiresAt" = clock_timestamp() + make_interval(secs => p_ttl_seconds),
        "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_id AND "leaseOwner" = btrim(p_owner) AND "leaseToken" = btrim(p_token)
      AND "leaseExpiresAt" > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM pg_catalog.set_config('crm.billing_lease_mutation', '', true);
  RETURN changed = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_execution_release_lease(p_id UUID, p_owner TEXT, p_token TEXT)
RETURNS BOOLEAN AS $$
DECLARE changed INTEGER;
BEGIN
  PERFORM pg_catalog.set_config('crm.billing_lease_mutation', 'allowed', true);
  UPDATE public."billing_executions"
    SET "leaseOwner" = NULL, "leaseToken" = NULL, "leaseExpiresAt" = NULL,
        "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_id AND "leaseOwner" = btrim(p_owner) AND "leaseToken" = btrim(p_token);
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM pg_catalog.set_config('crm.billing_lease_mutation', '', true);
  RETURN changed = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_actor_canonical_value(p_type TEXT, p_value TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_type !~ '^[VESUIHDM]$' THEN
    RAISE EXCEPTION 'Unsupported Billing canonical type' USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL THEN
    RETURN p_type || '0:';
  END IF;
  IF p_value ~ '[[:cntrl:]]' OR NOT (p_value IS NFC NORMALIZED) THEN
    RAISE EXCEPTION 'Billing canonical value must be control-free NFC text'
      USING ERRCODE = '22023';
  END IF;
  RETURN p_type || '1:' || pg_catalog.octet_length(pg_catalog.convert_to(p_value, 'UTF8'))::text || ':' || p_value;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_execution_verify_actor(
  p_operation TEXT,
  p_execution_id UUID,
  p_message_dispatch_id UUID,
  p_receivable_id UUID,
  p_financial_set_digest TEXT,
  p_expected_version INTEGER,
  p_arguments_digest TEXT,
  p_actor_type public."BillingActorType",
  p_actor_user_id UUID,
  p_actor_principal TEXT,
  p_actor_issued_at BIGINT,
  p_actor_nonce UUID,
  p_actor_key_id TEXT,
  p_actor_signature TEXT
) RETURNS void AS $$
DECLARE
  signing_secret BYTEA;
  expected_signature BYTEA;
  supplied_signature BYTEA;
  canonical_payload TEXT;
  signature_difference INTEGER := 0;
  signature_index INTEGER;
BEGIN
  IF p_operation NOT IN (
      'billing.pix.reserve', 'billing.pix.prepare-create', 'billing.pix.record-create-result',
      'billing.pix.reconcile-create-result',
      'billing.execution.transition', 'billing.receivable.amend'
    )
    OR p_execution_id IS NULL
    OR p_execution_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR p_message_dispatch_id IS NULL
    OR p_message_dispatch_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR p_receivable_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR p_expected_version < 0
    OR p_financial_set_digest !~ '^[0-9a-f]{64}$'
    OR p_arguments_digest !~ '^[0-9a-f]{64}$'
    OR (p_operation = 'billing.receivable.amend') IS DISTINCT FROM (p_receivable_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid Billing actor operation context' USING ERRCODE = '28000';
  END IF;
  IF p_actor_type = 'USER' THEN
    IF p_actor_user_id IS NULL
      OR p_actor_user_id = '00000000-0000-0000-0000-000000000000'::uuid
      OR p_actor_principal IS DISTINCT FROM p_actor_user_id::text
      OR NOT EXISTS (SELECT 1 FROM public."users" WHERE "id" = p_actor_user_id) THEN
      RAISE EXCEPTION 'Billing USER actor requires an existing user' USING ERRCODE = '23514';
    END IF;
  ELSIF p_actor_user_id IS NOT NULL OR btrim(COALESCE(p_actor_principal, '')) = '' THEN
    RAISE EXCEPTION 'Billing SYSTEM/WEBHOOK actor cannot use a user id' USING ERRCODE = '23514';
  END IF;
  IF pg_catalog.length(p_actor_principal) > 255
    OR p_actor_principal ~ '[[:cntrl:]]'
    OR p_actor_key_id ~ '[[:cntrl:]]'
    OR NOT (p_actor_principal IS NFC NORMALIZED)
    OR NOT (p_actor_key_id IS NFC NORMALIZED)
    OR p_actor_principal IS DISTINCT FROM btrim(p_actor_principal)
    OR p_actor_key_id IS DISTINCT FROM btrim(p_actor_key_id)
    OR btrim(COALESCE(p_actor_key_id, '')) = ''
    OR p_actor_nonce IS NULL
    OR p_actor_nonce = '00000000-0000-0000-0000-000000000000'::uuid
    OR p_actor_issued_at IS NULL
    OR abs(extract(epoch FROM clock_timestamp())::bigint - p_actor_issued_at) > 300
    OR p_actor_signature !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid or expired Billing actor assertion' USING ERRCODE = '28000';
  END IF;

  SELECT k."secret" INTO signing_secret
  FROM public."billing_actor_keys" k
  WHERE k."actorType" = p_actor_type AND k."keyId" = p_actor_key_id AND k."enabled";
  IF signing_secret IS NULL THEN
    RAISE EXCEPTION 'Unknown Billing actor signing key' USING ERRCODE = '28000';
  END IF;

  canonical_payload := public.billing_actor_canonical_value('V', 'billing-actor:v2')
    || public.billing_actor_canonical_value('E', p_operation)
    || public.billing_actor_canonical_value('U', p_execution_id::text)
    || public.billing_actor_canonical_value('U', p_message_dispatch_id::text)
    || public.billing_actor_canonical_value('U', p_receivable_id::text)
    || public.billing_actor_canonical_value('H', p_financial_set_digest)
    || public.billing_actor_canonical_value('I', p_expected_version::text)
    || public.billing_actor_canonical_value('H', p_arguments_digest)
    || public.billing_actor_canonical_value('E', p_actor_type::text)
    || public.billing_actor_canonical_value('U', p_actor_user_id::text)
    || public.billing_actor_canonical_value('S', p_actor_principal)
    || public.billing_actor_canonical_value('I', p_actor_issued_at::text)
    || public.billing_actor_canonical_value('U', p_actor_nonce::text)
    || public.billing_actor_canonical_value('S', p_actor_key_id);
  expected_signature := public.hmac(
    pg_catalog.convert_to(canonical_payload, 'UTF8'), signing_secret, 'sha256'
  );
  supplied_signature := pg_catalog.decode(p_actor_signature, 'hex');
  IF octet_length(expected_signature) <> octet_length(supplied_signature) THEN
    RAISE EXCEPTION 'Invalid Billing actor signature' USING ERRCODE = '28000';
  END IF;
  FOR signature_index IN 0..octet_length(expected_signature) - 1 LOOP
    signature_difference := signature_difference
      | (get_byte(expected_signature, signature_index) # get_byte(supplied_signature, signature_index));
  END LOOP;
  IF signature_difference <> 0 THEN
    RAISE EXCEPTION 'Invalid Billing actor signature' USING ERRCODE = '28000';
  END IF;

  BEGIN
    INSERT INTO public."billing_actor_assertions" (
      "nonce", "actorType", "actorUserId", "principal", "keyId", "operation",
      "billingExecutionId", "messageDispatchId", "receivableId", "financialSetDigest",
      "expectedVersion", "argumentsDigest", "issuedAtEpoch"
    ) VALUES (
      p_actor_nonce, p_actor_type, p_actor_user_id, p_actor_principal,
      p_actor_key_id, p_operation, p_execution_id, p_message_dispatch_id, p_receivable_id,
      p_financial_set_digest, p_expected_version, p_arguments_digest, p_actor_issued_at
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Billing actor assertion was already consumed' USING ERRCODE = '28000';
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_pix_reserve(
  p_execution_id UUID,
  p_expected_version INTEGER,
  p_owner TEXT,
  p_token TEXT,
  p_creation_key TEXT,
  p_actor_type public."BillingActorType",
  p_actor_user_id UUID,
  p_actor_principal TEXT,
  p_actor_issued_at BIGINT,
  p_actor_nonce UUID,
  p_actor_key_id TEXT,
  p_actor_signature TEXT,
  p_reason TEXT
) RETURNS UUID AS $$
DECLARE
  execution_record public."billing_executions"%ROWTYPE;
  attempt_id UUID := gen_random_uuid();
  arguments_digest TEXT;
BEGIN
  IF btrim(COALESCE(p_owner, '')) = '' OR btrim(COALESCE(p_token, '')) = ''
    OR btrim(COALESCE(p_creation_key, '')) = '' OR btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Billing PIX reservation requires creation key and reason' USING ERRCODE = '22023';
  END IF;

  -- Match the lock order used by a concurrent Receivable UPDATE: financial
  -- source rows first, execution row second. This avoids a row/execution
  -- deadlock while still serializing the terminal-evidence check.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pix:receivable:' || ber."receivableId"::text, 0)
  )
  FROM public."billing_execution_receivables" ber
  WHERE ber."billingExecutionId" = p_execution_id
  ORDER BY ber."receivableId";
  PERFORM r."id" FROM public."receivables" r
  JOIN public."billing_execution_receivables" ber ON ber."receivableId" = r."id"
  WHERE ber."billingExecutionId" = p_execution_id
  ORDER BY r."id" FOR UPDATE OF r;

  SELECT * INTO execution_record FROM public."billing_executions"
  WHERE "id" = p_execution_id AND "isCurrent" FOR UPDATE;
  IF NOT FOUND OR execution_record."version" <> p_expected_version
    OR execution_record."leaseOwner" IS DISTINCT FROM btrim(p_owner)
    OR execution_record."leaseToken" IS DISTINCT FROM btrim(p_token)
    OR execution_record."leaseExpiresAt" <= clock_timestamp() THEN
    RAISE EXCEPTION 'Billing execution lease or expectedVersion is stale' USING ERRCODE = '40001';
  END IF;
  arguments_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
      public.billing_actor_canonical_value('V', 'billing-operation-args:v1')
      || public.billing_actor_canonical_value('S', btrim(p_owner))
      || public.billing_actor_canonical_value('S', btrim(p_token))
      || public.billing_actor_canonical_value('S', btrim(p_creation_key))
      || public.billing_actor_canonical_value('S', btrim(p_reason)),
      'UTF8'
    ), 'sha256'), 'hex');
  PERFORM public.billing_execution_verify_actor(
    'billing.pix.reserve', p_execution_id, execution_record."messageDispatchId", NULL,
    execution_record."receivableSetHash", p_expected_version, arguments_digest,
    p_actor_type, p_actor_user_id, p_actor_principal, p_actor_issued_at,
    p_actor_nonce, p_actor_key_id, p_actor_signature
  );
  IF execution_record."status" NOT IN ('SCHEDULED','PROCESSING','WAITING_PIX')
    OR execution_record."pixStatus" NOT IN ('NOT_STARTED','FAILED','SUPERSEDED') THEN
    RAISE EXCEPTION 'Billing execution is not eligible for PIX reservation' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."billing_execution_receivables" ber
    JOIN public."receivables" r ON r."id" = ber."receivableId"
    WHERE ber."billingExecutionId" = p_execution_id AND r."status" <> 'PENDENTE'
  ) OR EXISTS (
    SELECT 1 FROM public."billing_pix_attempts"
    WHERE "billingExecutionId" = p_execution_id AND "status" = 'PAID'
  ) OR EXISTS (
    SELECT 1
    FROM public."billing_execution_receivables" ber
    JOIN public."payment_intents" pi ON pi."receivableId" = ber."receivableId"
    WHERE ber."billingExecutionId" = p_execution_id AND pi."status" IN ('PAID','REFUNDED')
  ) OR EXISTS (
    SELECT 1
    FROM public."billing_execution_receivables" ber
    JOIN public."payment_group_items" pgi ON pgi."receivableId" = ber."receivableId"
    JOIN public."payment_intents" pi ON pi."paymentGroupId" = pgi."paymentGroupId"
    WHERE ber."billingExecutionId" = p_execution_id AND pi."status" IN ('PAID','REFUNDED')
  ) THEN
    RAISE EXCEPTION 'Billing PIX reservation blocked by terminal financial evidence'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public."billing_pix_attempts" SET "isCurrent" = false, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "billingExecutionId" = p_execution_id AND "isCurrent"
    AND "status" IN ('FAILED','EXPIRED','CANCELED','SUPERSEDED');
  UPDATE public."billing_executions"
  SET "pixStatus" = 'RESERVED', "lastActorType" = p_actor_type,
      "lastActorUserId" = p_actor_user_id, "lastMutationReason" = btrim(p_reason),
      "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_execution_id AND "version" = p_expected_version
    AND "leaseOwner" = btrim(p_owner) AND "leaseToken" = btrim(p_token)
    AND "leaseExpiresAt" > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing PIX reservation lost compare-and-swap' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public."billing_pix_attempts" (
    "id", "billingExecutionId", "creationKey", "isCurrent", "status", "createdAt", "updatedAt"
  ) VALUES (
    attempt_id, p_execution_id, btrim(p_creation_key), true, 'RESERVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
  RETURN attempt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_pix_prepare_create(
  p_execution_id UUID,
  p_expected_version INTEGER,
  p_owner TEXT,
  p_token TEXT,
  p_attempt_id UUID,
  p_creation_key TEXT,
  p_provider public."PaymentProviderCode",
  p_actor_type public."BillingActorType",
  p_actor_user_id UUID,
  p_actor_principal TEXT,
  p_actor_issued_at BIGINT,
  p_actor_nonce UUID,
  p_actor_key_id TEXT,
  p_actor_signature TEXT,
  p_reason TEXT
) RETURNS INTEGER AS $$
DECLARE
  execution_record public."billing_executions"%ROWTYPE;
  arguments_digest TEXT;
BEGIN
  IF btrim(COALESCE(p_owner, '')) = '' OR btrim(COALESCE(p_token, '')) = ''
    OR btrim(COALESCE(p_creation_key, '')) = '' OR btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Billing PIX preparation requires identity and reason' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pix:receivable:' || ber."receivableId"::text, 0)
  )
  FROM public."billing_execution_receivables" ber
  WHERE ber."billingExecutionId" = p_execution_id
  ORDER BY ber."receivableId";
  PERFORM r."id" FROM public."receivables" r
  JOIN public."billing_execution_receivables" ber ON ber."receivableId" = r."id"
  WHERE ber."billingExecutionId" = p_execution_id
  ORDER BY r."id" FOR UPDATE OF r;
  SELECT * INTO execution_record FROM public."billing_executions"
  WHERE "id" = p_execution_id AND "isCurrent" FOR UPDATE;
  IF NOT FOUND OR execution_record."version" <> p_expected_version
    OR execution_record."leaseOwner" IS DISTINCT FROM btrim(p_owner)
    OR execution_record."leaseToken" IS DISTINCT FROM btrim(p_token)
    OR execution_record."leaseExpiresAt" <= clock_timestamp() THEN
    RAISE EXCEPTION 'Billing PIX preparation lease or expectedVersion is stale'
      USING ERRCODE = '40001';
  END IF;

  arguments_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
      public.billing_actor_canonical_value('V', 'billing-operation-args:v1')
      || public.billing_actor_canonical_value('S', btrim(p_owner))
      || public.billing_actor_canonical_value('S', btrim(p_token))
      || public.billing_actor_canonical_value('U', p_attempt_id::text)
      || public.billing_actor_canonical_value('S', btrim(p_creation_key))
      || public.billing_actor_canonical_value('E', p_provider::text)
      || public.billing_actor_canonical_value('S', btrim(p_reason)),
      'UTF8'
    ), 'sha256'), 'hex');
  PERFORM public.billing_execution_verify_actor(
    'billing.pix.prepare-create', p_execution_id, execution_record."messageDispatchId", NULL,
    execution_record."receivableSetHash", p_expected_version, arguments_digest,
    p_actor_type, p_actor_user_id, p_actor_principal, p_actor_issued_at,
    p_actor_nonce, p_actor_key_id, p_actor_signature
  );

  IF execution_record."status" NOT IN ('SCHEDULED','PROCESSING','WAITING_PIX')
    OR execution_record."pixStatus" <> 'RESERVED'
    OR execution_record."reviewRequired"
    OR NOT EXISTS (
      SELECT 1 FROM public."billing_pix_attempts"
      WHERE "id" = p_attempt_id AND "billingExecutionId" = p_execution_id
        AND "isCurrent" AND "status" = 'RESERVED'
        AND "creationKey" = btrim(p_creation_key)
    ) OR EXISTS (
      SELECT 1 FROM public."billing_execution_receivables" ber
      JOIN public."receivables" r ON r."id" = ber."receivableId"
      WHERE ber."billingExecutionId" = p_execution_id AND r."status" <> 'PENDENTE'
    ) THEN
    RAISE EXCEPTION 'Billing PIX reservation is not eligible for creation preparation'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public."billing_executions"
  SET "status" = 'PROCESSING', "pixStatus" = 'CREATING',
      "lastActorType" = p_actor_type, "lastActorUserId" = p_actor_user_id,
      "lastMutationReason" = btrim(p_reason), "version" = "version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_execution_id AND "version" = p_expected_version
    AND "leaseOwner" = btrim(p_owner) AND "leaseToken" = btrim(p_token)
    AND "leaseExpiresAt" > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing PIX preparation lost compare-and-swap' USING ERRCODE = '40001';
  END IF;
  UPDATE public."billing_pix_attempts"
  SET "status" = 'CREATING', "provider" = p_provider,
      "providerCorrelationId" = btrim(p_creation_key), "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_attempt_id AND "billingExecutionId" = p_execution_id
    AND "isCurrent" AND "status" = 'RESERVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing PIX attempt changed during preparation' USING ERRCODE = '40001';
  END IF;
  RETURN p_expected_version + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_pix_record_create_result(
  p_execution_id UUID,
  p_expected_version INTEGER,
  p_owner TEXT,
  p_token TEXT,
  p_attempt_id UUID,
  p_creation_key TEXT,
  p_provider public."PaymentProviderCode",
  p_result_kind TEXT,
  p_provider_transaction_id TEXT,
  p_amount_text TEXT,
  p_external_status TEXT,
  p_external_depix_id TEXT,
  p_blockchain_tx_id TEXT,
  p_pix_copy_paste TEXT,
  p_qr_code_data TEXT,
  p_expires_at_text TEXT,
  p_failure_code TEXT,
  p_failure_message TEXT,
  p_actor_type public."BillingActorType",
  p_actor_user_id UUID,
  p_actor_principal TEXT,
  p_actor_issued_at BIGINT,
  p_actor_nonce UUID,
  p_actor_key_id TEXT,
  p_actor_signature TEXT,
  p_reason TEXT
) RETURNS UUID AS $$
DECLARE
  execution_record public."billing_executions"%ROWTYPE;
  attempt_record public."billing_pix_attempts"%ROWTYPE;
  arguments_digest TEXT;
  snapshot_amount NUMERIC(12,2);
  canonical_amount NUMERIC(12,2);
  expires_at TIMESTAMP(3);
  receivable_count INTEGER;
  payment_intent_id UUID := NULL;
  payment_group_id UUID := NULL;
  final_pix_status public."BillingPixStatus";
  final_execution_status public."BillingExecutionStatus";
  effective_failure_code TEXT := NULLIF(btrim(COALESCE(p_failure_code, '')), '');
  effective_failure_message TEXT := NULLIF(btrim(COALESCE(p_failure_message, '')), '');
BEGIN
  IF btrim(COALESCE(p_owner, '')) = '' OR btrim(COALESCE(p_token, '')) = ''
    OR btrim(COALESCE(p_creation_key, '')) = '' OR btrim(COALESCE(p_reason, '')) = ''
    OR p_result_kind NOT IN (
      'CONFIRMED','HTTP_REJECTION_OBSERVED','REMOTE_RESULT_UNCERTAIN','PRE_CALL_FAILURE'
    ) THEN
    RAISE EXCEPTION 'Invalid Billing PIX create result' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pix:receivable:' || ber."receivableId"::text, 0)
  )
  FROM public."billing_execution_receivables" ber
  WHERE ber."billingExecutionId" = p_execution_id
  ORDER BY ber."receivableId";
  PERFORM r."id" FROM public."receivables" r
  JOIN public."billing_execution_receivables" ber ON ber."receivableId" = r."id"
  WHERE ber."billingExecutionId" = p_execution_id
  ORDER BY r."id" FOR UPDATE OF r;
  SELECT * INTO execution_record FROM public."billing_executions"
  WHERE "id" = p_execution_id AND "isCurrent" FOR UPDATE;
  SELECT * INTO attempt_record FROM public."billing_pix_attempts"
  WHERE "id" = p_attempt_id AND "billingExecutionId" = p_execution_id AND "isCurrent" FOR UPDATE;
  IF NOT FOUND OR execution_record."version" <> p_expected_version
    OR execution_record."leaseOwner" IS DISTINCT FROM btrim(p_owner)
    OR execution_record."leaseToken" IS DISTINCT FROM btrim(p_token)
    OR execution_record."leaseExpiresAt" <= clock_timestamp()
    OR execution_record."status" <> 'PROCESSING'
    OR execution_record."pixStatus" <> 'CREATING'
    OR attempt_record."status" <> 'CREATING'
    OR attempt_record."creationKey" IS DISTINCT FROM btrim(p_creation_key)
    OR attempt_record."provider" IS DISTINCT FROM p_provider THEN
    RAISE EXCEPTION 'Billing PIX create result target is stale or incompatible'
      USING ERRCODE = '40001';
  END IF;

  arguments_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
      public.billing_actor_canonical_value('V', 'billing-operation-args:v1')
      || public.billing_actor_canonical_value('S', btrim(p_owner))
      || public.billing_actor_canonical_value('S', btrim(p_token))
      || public.billing_actor_canonical_value('U', p_attempt_id::text)
      || public.billing_actor_canonical_value('S', btrim(p_creation_key))
      || public.billing_actor_canonical_value('E', p_provider::text)
      || public.billing_actor_canonical_value('E', p_result_kind)
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_provider_transaction_id, '')), ''))
      || public.billing_actor_canonical_value('M', NULLIF(btrim(COALESCE(p_amount_text, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_external_status, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_external_depix_id, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_blockchain_tx_id, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_pix_copy_paste, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_qr_code_data, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_expires_at_text, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_failure_code, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_failure_message, '')), ''))
      || public.billing_actor_canonical_value('S', btrim(p_reason)),
      'UTF8'
    ), 'sha256'), 'hex');
  PERFORM public.billing_execution_verify_actor(
    'billing.pix.record-create-result', p_execution_id, execution_record."messageDispatchId", NULL,
    execution_record."receivableSetHash", p_expected_version, arguments_digest,
    p_actor_type, p_actor_user_id, p_actor_principal, p_actor_issued_at,
    p_actor_nonce, p_actor_key_id, p_actor_signature
  );

  SELECT count(*), sum("amountSnapshot") INTO receivable_count, snapshot_amount
  FROM public."billing_execution_receivables" WHERE "billingExecutionId" = p_execution_id;

  IF p_result_kind = 'CONFIRMED' THEN
    IF btrim(COALESCE(p_provider_transaction_id, '')) = ''
      OR p_amount_text IS NULL
      OR p_amount_text !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      OR (NULLIF(btrim(COALESCE(p_pix_copy_paste, '')), '') IS NULL
        AND NULLIF(btrim(COALESCE(p_qr_code_data, '')), '') IS NULL) THEN
      RAISE EXCEPTION 'Confirmed Billing PIX requires complete provider evidence'
        USING ERRCODE = '22023';
    END IF;
    BEGIN
      canonical_amount := p_amount_text::numeric(12,2);
      expires_at := CASE WHEN NULLIF(btrim(COALESCE(p_expires_at_text, '')), '') IS NULL
        THEN NULL ELSE p_expires_at_text::timestamptz END;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid confirmed Billing PIX provider evidence' USING ERRCODE = '22023';
    END;
    IF canonical_amount IS DISTINCT FROM snapshot_amount OR canonical_amount <= 0 THEN
      RAISE EXCEPTION 'Confirmed Billing PIX amount does not match execution'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public."billing_execution_receivables" ber
      JOIN public."payment_intents" pi ON pi."receivableId" = ber."receivableId"
      WHERE ber."billingExecutionId" = p_execution_id
        AND pi."status" IN ('CREATED','WAITING_PAYMENT','PAID','REFUNDED')
      UNION ALL
      SELECT 1
      FROM public."billing_execution_receivables" ber
      JOIN public."payment_group_items" pgi ON pgi."receivableId" = ber."receivableId"
      JOIN public."payment_intents" pi ON pi."paymentGroupId" = pgi."paymentGroupId"
      WHERE ber."billingExecutionId" = p_execution_id
        AND pi."status" IN ('CREATED','WAITING_PAYMENT','PAID','REFUNDED')
    ) THEN
      final_pix_status := 'AMBIGUOUS';
      final_execution_status := 'REVIEW_REQUIRED';
      effective_failure_code := 'CONCURRENT_PAYMENT_INTENT_CONFLICT';
      effective_failure_message :=
        'PaymentIntent concorrente surgiu durante a chamada; reconciliacao obrigatoria.';
    ELSE
      payment_intent_id := gen_random_uuid();
    IF receivable_count = 1 THEN
      INSERT INTO public."payment_intents" (
        "id","receivableId","provider","providerTransactionId","externalStatus",
        "externalDepixId","blockchainTxId","status","origin","creationKey","amount",
        "pixCopyPaste","qrCodeData","expiresAt","lastSyncAt","createdAt","updatedAt"
      )
      SELECT payment_intent_id, ber."receivableId", p_provider, btrim(p_provider_transaction_id),
        NULLIF(btrim(COALESCE(p_external_status, '')), ''),
        NULLIF(btrim(COALESCE(p_external_depix_id, '')), ''),
        NULLIF(btrim(COALESCE(p_blockchain_tx_id, '')), ''), 'WAITING_PAYMENT', 'BILLING',
        btrim(p_creation_key), canonical_amount,
        NULLIF(btrim(COALESCE(p_pix_copy_paste, '')), ''),
        NULLIF(btrim(COALESCE(p_qr_code_data, '')), ''), expires_at,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM public."billing_execution_receivables" ber
      WHERE ber."billingExecutionId" = p_execution_id;
    ELSE
      payment_group_id := gen_random_uuid();
      INSERT INTO public."payment_groups" (
        "id","clientId","status","totalAmount","createdAt","updatedAt"
      ) VALUES (
        payment_group_id, execution_record."clientId", 'WAITING_PAYMENT',
        canonical_amount, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
      INSERT INTO public."payment_group_items" (
        "id","paymentGroupId","receivableId","amount","createdAt"
      )
      SELECT gen_random_uuid(), payment_group_id, "receivableId", "amountSnapshot", CURRENT_TIMESTAMP
      FROM public."billing_execution_receivables"
      WHERE "billingExecutionId" = p_execution_id ORDER BY "receivableId";
      INSERT INTO public."payment_intents" (
        "id","paymentGroupId","provider","providerTransactionId","externalStatus",
        "externalDepixId","blockchainTxId","status","origin","creationKey","amount",
        "pixCopyPaste","qrCodeData","expiresAt","lastSyncAt","createdAt","updatedAt"
      ) VALUES (
        payment_intent_id, payment_group_id, p_provider, btrim(p_provider_transaction_id),
        NULLIF(btrim(COALESCE(p_external_status, '')), ''),
        NULLIF(btrim(COALESCE(p_external_depix_id, '')), ''),
        NULLIF(btrim(COALESCE(p_blockchain_tx_id, '')), ''), 'WAITING_PAYMENT', 'BILLING',
        btrim(p_creation_key), canonical_amount,
        NULLIF(btrim(COALESCE(p_pix_copy_paste, '')), ''),
        NULLIF(btrim(COALESCE(p_qr_code_data, '')), ''), expires_at,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    END IF;
      final_pix_status := 'CONFIRMED';
      final_execution_status := 'WAITING_PIX';
    END IF;
  ELSIF p_result_kind = 'PRE_CALL_FAILURE' THEN
    final_pix_status := 'FAILED';
    final_execution_status := 'REVIEW_REQUIRED';
  ELSE
    final_pix_status := 'AMBIGUOUS';
    final_execution_status := 'REVIEW_REQUIRED';
  END IF;

  UPDATE public."billing_pix_attempts"
  SET "status" = final_pix_status, "paymentIntentId" = payment_intent_id,
      "providerTransactionId" = NULLIF(btrim(COALESCE(p_provider_transaction_id, '')), ''),
      "failureCode" = effective_failure_code,
      "failureMessage" = effective_failure_message,
      "reviewRequired" = (final_execution_status = 'REVIEW_REQUIRED'),
      "startedAt" = CURRENT_TIMESTAMP,
      "confirmedAt" = CASE WHEN final_pix_status = 'CONFIRMED' THEN CURRENT_TIMESTAMP ELSE NULL END,
      "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_attempt_id AND "status" = 'CREATING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing PIX attempt changed before result persistence'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public."billing_executions"
  SET "status" = final_execution_status, "pixStatus" = final_pix_status,
      "paymentIntentId" = payment_intent_id,
      "reviewRequired" = (final_execution_status = 'REVIEW_REQUIRED'),
      "blockedCode" = CASE WHEN final_execution_status = 'REVIEW_REQUIRED'
        THEN CASE WHEN final_pix_status = 'AMBIGUOUS' THEN 'PIX_REMOTE_RESULT_UNCERTAIN'
          ELSE 'PIX_PRE_CALL_FAILURE' END ELSE NULL END,
      "blockedReason" = CASE WHEN final_execution_status = 'REVIEW_REQUIRED'
        THEN btrim(p_reason) ELSE NULL END,
      "nextAttemptAt" = NULL, "lastActorType" = p_actor_type,
      "lastActorUserId" = p_actor_user_id, "lastMutationReason" = btrim(p_reason),
      "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_execution_id AND "version" = p_expected_version
    AND "leaseOwner" = btrim(p_owner) AND "leaseToken" = btrim(p_token)
    AND "leaseExpiresAt" > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing PIX result lost compare-and-swap' USING ERRCODE = '40001';
  END IF;
  IF payment_intent_id IS NOT NULL THEN
    UPDATE public."message_dispatches" SET "paymentIntentId" = payment_intent_id
    WHERE "id" = execution_record."messageDispatchId";
  END IF;
  RETURN payment_intent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_pix_reconcile_create_result(
  p_execution_id UUID,
  p_expected_version INTEGER,
  p_owner TEXT,
  p_token TEXT,
  p_attempt_id UUID,
  p_creation_key TEXT,
  p_provider public."PaymentProviderCode",
  p_result_kind TEXT,
  p_provider_transaction_id TEXT,
  p_amount_text TEXT,
  p_external_status TEXT,
  p_external_depix_id TEXT,
  p_blockchain_tx_id TEXT,
  p_pix_copy_paste TEXT,
  p_qr_code_data TEXT,
  p_expires_at_text TEXT,
  p_failure_code TEXT,
  p_reconciliation_evidence TEXT,
  p_actor_type public."BillingActorType",
  p_actor_user_id UUID,
  p_actor_principal TEXT,
  p_actor_issued_at BIGINT,
  p_actor_nonce UUID,
  p_actor_key_id TEXT,
  p_actor_signature TEXT,
  p_reason TEXT
) RETURNS UUID AS $$
DECLARE
  execution_record public."billing_executions"%ROWTYPE;
  attempt_record public."billing_pix_attempts"%ROWTYPE;
  existing_intent public."payment_intents"%ROWTYPE;
  arguments_digest TEXT;
  snapshot_amount NUMERIC(12,2);
  canonical_amount NUMERIC(12,2);
  expires_at TIMESTAMP(3);
  receivable_count INTEGER;
  matching_intent_count INTEGER;
  exact_group_count INTEGER;
  changed INTEGER;
  payment_intent_id UUID := NULL;
  payment_group_id UUID := NULL;
  confirmed BOOLEAN := false;
  conflict_code TEXT := NULLIF(btrim(COALESCE(p_failure_code, '')), '');
BEGIN
  IF btrim(COALESCE(p_owner, '')) = '' OR btrim(COALESCE(p_token, '')) = ''
    OR btrim(COALESCE(p_creation_key, '')) = ''
    OR btrim(COALESCE(p_provider_transaction_id, '')) = ''
    OR btrim(COALESCE(p_reconciliation_evidence, '')) = ''
    OR btrim(COALESCE(p_reason, '')) = ''
    OR p_result_kind NOT IN ('CONFIRMED','REVIEW_REQUIRED') THEN
    RAISE EXCEPTION 'Invalid Billing PIX reconciliation result' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pix:receivable:' || ber."receivableId"::text, 0)
  )
  FROM public."billing_execution_receivables" ber
  WHERE ber."billingExecutionId" = p_execution_id
  ORDER BY ber."receivableId";
  PERFORM r."id" FROM public."receivables" r
  JOIN public."billing_execution_receivables" ber ON ber."receivableId" = r."id"
  WHERE ber."billingExecutionId" = p_execution_id
  ORDER BY r."id" FOR UPDATE OF r;
  SELECT * INTO execution_record FROM public."billing_executions"
  WHERE "id" = p_execution_id AND "isCurrent" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing PIX reconciliation execution is stale' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO attempt_record FROM public."billing_pix_attempts"
  WHERE "id" = p_attempt_id AND "billingExecutionId" = p_execution_id AND "isCurrent" FOR UPDATE;
  IF NOT FOUND OR execution_record."version" <> p_expected_version
    OR execution_record."leaseOwner" IS DISTINCT FROM btrim(p_owner)
    OR execution_record."leaseToken" IS DISTINCT FROM btrim(p_token)
    OR execution_record."leaseExpiresAt" <= clock_timestamp()
    OR execution_record."status" NOT IN ('PROCESSING','REVIEW_REQUIRED','WAITING_PIX')
    OR execution_record."pixStatus" NOT IN ('CREATING','AMBIGUOUS','CONFIRMED')
    OR attempt_record."status" NOT IN ('CREATING','AMBIGUOUS','CONFIRMED')
    OR attempt_record."creationKey" IS DISTINCT FROM btrim(p_creation_key)
    OR attempt_record."provider" IS DISTINCT FROM p_provider
    OR attempt_record."providerTransactionId" IS NULL
    OR attempt_record."providerTransactionId" IS DISTINCT FROM btrim(p_provider_transaction_id) THEN
    RAISE EXCEPTION 'Billing PIX reconciliation target is stale or incompatible'
      USING ERRCODE = '40001';
  END IF;

  arguments_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
      public.billing_actor_canonical_value('V', 'billing-operation-args:v1')
      || public.billing_actor_canonical_value('S', btrim(p_owner))
      || public.billing_actor_canonical_value('S', btrim(p_token))
      || public.billing_actor_canonical_value('U', p_attempt_id::text)
      || public.billing_actor_canonical_value('S', btrim(p_creation_key))
      || public.billing_actor_canonical_value('E', p_provider::text)
      || public.billing_actor_canonical_value('E', p_result_kind)
      || public.billing_actor_canonical_value('S', btrim(p_provider_transaction_id))
      || public.billing_actor_canonical_value('M', NULLIF(btrim(COALESCE(p_amount_text, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_external_status, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_external_depix_id, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_blockchain_tx_id, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_pix_copy_paste, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_qr_code_data, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_expires_at_text, '')), ''))
      || public.billing_actor_canonical_value('S', NULLIF(btrim(COALESCE(p_failure_code, '')), ''))
      || public.billing_actor_canonical_value('S', btrim(p_reconciliation_evidence))
      || public.billing_actor_canonical_value('S', btrim(p_reason)),
      'UTF8'
    ), 'sha256'), 'hex');
  PERFORM public.billing_execution_verify_actor(
    'billing.pix.reconcile-create-result', p_execution_id,
    execution_record."messageDispatchId", NULL, execution_record."receivableSetHash",
    p_expected_version, arguments_digest, p_actor_type, p_actor_user_id,
    p_actor_principal, p_actor_issued_at, p_actor_nonce, p_actor_key_id, p_actor_signature
  );

  SELECT count(*), sum("amountSnapshot") INTO receivable_count, snapshot_amount
  FROM public."billing_execution_receivables" WHERE "billingExecutionId" = p_execution_id;

  IF p_result_kind = 'CONFIRMED' THEN
    IF p_amount_text IS NULL
      OR p_amount_text !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      OR btrim(COALESCE(p_external_status, '')) <> 'WAITING_PAYMENT'
      OR (NULLIF(btrim(COALESCE(p_pix_copy_paste, '')), '') IS NULL
        AND NULLIF(btrim(COALESCE(p_qr_code_data, '')), '') IS NULL) THEN
      RAISE EXCEPTION 'Confirmed reconciliation requires complete provider evidence'
        USING ERRCODE = '22023';
    END IF;
    BEGIN
      canonical_amount := p_amount_text::numeric(12,2);
      expires_at := CASE WHEN NULLIF(btrim(COALESCE(p_expires_at_text, '')), '') IS NULL
        THEN NULL ELSE p_expires_at_text::timestamptz END;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid reconciled Billing PIX evidence' USING ERRCODE = '22023';
    END;
    IF canonical_amount IS DISTINCT FROM snapshot_amount OR canonical_amount <= 0 THEN
      RAISE EXCEPTION 'Reconciled Billing PIX amount does not match execution'
        USING ERRCODE = '23514';
    END IF;

    SELECT count(*), (array_agg(pi."id" ORDER BY pi."id"))[1]
    INTO matching_intent_count, payment_intent_id
    FROM public."payment_intents" pi
    WHERE (pi."provider" = p_provider
      AND pi."providerTransactionId" = btrim(p_provider_transaction_id))
      OR pi."creationKey" = btrim(p_creation_key);
    IF matching_intent_count > 1 THEN
      conflict_code := 'RECONCILIATION_INTENT_IDENTITY_CONFLICT';
      payment_intent_id := NULL;
    ELSIF payment_intent_id IS NOT NULL THEN
      SELECT * INTO existing_intent FROM public."payment_intents"
      WHERE "id" = payment_intent_id FOR UPDATE;
      IF existing_intent."provider" IS DISTINCT FROM p_provider
        OR existing_intent."providerTransactionId" IS DISTINCT FROM btrim(p_provider_transaction_id)
        OR existing_intent."creationKey" IS DISTINCT FROM btrim(p_creation_key)
        OR existing_intent."amount" IS DISTINCT FROM canonical_amount
        OR existing_intent."origin" <> 'BILLING'
        OR existing_intent."status" NOT IN ('CREATED','WAITING_PAYMENT') THEN
        conflict_code := 'RECONCILIATION_INTENT_IDENTITY_CONFLICT';
        payment_intent_id := NULL;
      ELSIF receivable_count = 1 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public."billing_execution_receivables" ber
          WHERE ber."billingExecutionId" = p_execution_id
            AND ber."receivableId" = existing_intent."receivableId"
        ) OR existing_intent."paymentGroupId" IS NOT NULL THEN
          conflict_code := 'RECONCILIATION_INTENT_SET_CONFLICT';
          payment_intent_id := NULL;
        END IF;
      ELSE
        SELECT count(*) INTO exact_group_count
        FROM public."payment_group_items" pgi
        WHERE pgi."paymentGroupId" = existing_intent."paymentGroupId";
        IF existing_intent."receivableId" IS NOT NULL
          OR existing_intent."paymentGroupId" IS NULL
          OR exact_group_count <> receivable_count
          OR EXISTS (
            SELECT 1 FROM public."payment_group_items" pgi
            WHERE pgi."paymentGroupId" = existing_intent."paymentGroupId"
              AND NOT EXISTS (
                SELECT 1 FROM public."billing_execution_receivables" ber
                WHERE ber."billingExecutionId" = p_execution_id
                  AND ber."receivableId" = pgi."receivableId"
                  AND ber."amountSnapshot" = pgi."amount"
              )
          ) THEN
          conflict_code := 'RECONCILIATION_INTENT_SET_CONFLICT';
          payment_intent_id := NULL;
        END IF;
      END IF;
    END IF;

    IF conflict_code IS NULL AND EXISTS (
      SELECT 1 FROM public."billing_execution_receivables" ber
      JOIN public."receivables" r ON r."id" = ber."receivableId"
      WHERE ber."billingExecutionId" = p_execution_id AND r."status" <> 'PENDENTE'
    ) THEN
      conflict_code := 'RECONCILIATION_RECEIVABLE_NOT_PENDING';
      payment_intent_id := NULL;
    END IF;
    IF conflict_code IS NULL AND EXISTS (
      SELECT 1
      FROM public."billing_execution_receivables" ber
      JOIN public."payment_intents" pi ON pi."receivableId" = ber."receivableId"
      WHERE ber."billingExecutionId" = p_execution_id
        AND pi."id" IS DISTINCT FROM payment_intent_id
        AND pi."status" IN ('CREATED','WAITING_PAYMENT','PAID','REFUNDED')
      UNION ALL
      SELECT 1
      FROM public."billing_execution_receivables" ber
      JOIN public."payment_group_items" pgi ON pgi."receivableId" = ber."receivableId"
      JOIN public."payment_intents" pi ON pi."paymentGroupId" = pgi."paymentGroupId"
      WHERE ber."billingExecutionId" = p_execution_id
        AND pi."id" IS DISTINCT FROM payment_intent_id
        AND pi."status" IN ('CREATED','WAITING_PAYMENT','PAID','REFUNDED')
    ) THEN
      conflict_code := 'RECONCILIATION_OVERLAPPING_INTENT';
      payment_intent_id := NULL;
    END IF;

    IF conflict_code IS NULL AND payment_intent_id IS NULL THEN
      payment_intent_id := gen_random_uuid();
      IF receivable_count = 1 THEN
        INSERT INTO public."payment_intents" (
          "id","receivableId","provider","providerTransactionId","externalStatus",
          "externalDepixId","blockchainTxId","status","origin","creationKey","amount",
          "pixCopyPaste","qrCodeData","expiresAt","lastSyncAt","createdAt","updatedAt"
        )
        SELECT payment_intent_id, ber."receivableId", p_provider,
          btrim(p_provider_transaction_id), btrim(p_external_status),
          NULLIF(btrim(COALESCE(p_external_depix_id, '')), ''),
          NULLIF(btrim(COALESCE(p_blockchain_tx_id, '')), ''), 'WAITING_PAYMENT', 'BILLING',
          btrim(p_creation_key), canonical_amount,
          NULLIF(btrim(COALESCE(p_pix_copy_paste, '')), ''),
          NULLIF(btrim(COALESCE(p_qr_code_data, '')), ''), expires_at,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM public."billing_execution_receivables" ber
        WHERE ber."billingExecutionId" = p_execution_id;
      ELSE
        payment_group_id := gen_random_uuid();
        INSERT INTO public."payment_groups" (
          "id","clientId","status","totalAmount","createdAt","updatedAt"
        ) VALUES (
          payment_group_id, execution_record."clientId", 'WAITING_PAYMENT',
          canonical_amount, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );
        INSERT INTO public."payment_group_items" (
          "id","paymentGroupId","receivableId","amount","createdAt"
        )
        SELECT gen_random_uuid(), payment_group_id, "receivableId", "amountSnapshot", CURRENT_TIMESTAMP
        FROM public."billing_execution_receivables"
        WHERE "billingExecutionId" = p_execution_id ORDER BY "receivableId";
        INSERT INTO public."payment_intents" (
          "id","paymentGroupId","provider","providerTransactionId","externalStatus",
          "externalDepixId","blockchainTxId","status","origin","creationKey","amount",
          "pixCopyPaste","qrCodeData","expiresAt","lastSyncAt","createdAt","updatedAt"
        ) VALUES (
          payment_intent_id, payment_group_id, p_provider, btrim(p_provider_transaction_id),
          btrim(p_external_status), NULLIF(btrim(COALESCE(p_external_depix_id, '')), ''),
          NULLIF(btrim(COALESCE(p_blockchain_tx_id, '')), ''), 'WAITING_PAYMENT', 'BILLING',
          btrim(p_creation_key), canonical_amount,
          NULLIF(btrim(COALESCE(p_pix_copy_paste, '')), ''),
          NULLIF(btrim(COALESCE(p_qr_code_data, '')), ''), expires_at,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );
      END IF;
    END IF;
    confirmed := conflict_code IS NULL AND payment_intent_id IS NOT NULL;
  END IF;

  IF confirmed THEN
    UPDATE public."billing_pix_attempts"
    SET "status" = 'CONFIRMED', "paymentIntentId" = payment_intent_id,
        "providerTransactionId" = btrim(p_provider_transaction_id),
        "failureCode" = NULL, "failureMessage" = NULL, "reviewRequired" = false,
        "reconciledAt" = CURRENT_TIMESTAMP,
        "reconciliationEvidence" = btrim(p_reconciliation_evidence),
        "confirmedAt" = COALESCE("confirmedAt", CURRENT_TIMESTAMP),
        "finishedAt" = COALESCE("finishedAt", CURRENT_TIMESTAMP),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_attempt_id;
    UPDATE public."billing_executions"
    SET "status" = 'WAITING_PIX', "pixStatus" = 'CONFIRMED',
        "paymentIntentId" = payment_intent_id, "reviewRequired" = false,
        "blockedCode" = NULL, "blockedReason" = NULL, "nextAttemptAt" = NULL,
        "lastActorType" = p_actor_type, "lastActorUserId" = p_actor_user_id,
        "lastMutationReason" = btrim(p_reason), "version" = "version" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_execution_id AND "version" = p_expected_version
      AND "leaseOwner" = btrim(p_owner) AND "leaseToken" = btrim(p_token)
      AND "leaseExpiresAt" > clock_timestamp();
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
      RAISE EXCEPTION 'Billing PIX reconciliation lost compare-and-swap' USING ERRCODE = '40001';
    END IF;
    UPDATE public."message_dispatches" SET "paymentIntentId" = payment_intent_id
    WHERE "id" = execution_record."messageDispatchId";
  ELSE
    conflict_code := COALESCE(conflict_code, 'PIX_RECONCILIATION_REVIEW_REQUIRED');
    UPDATE public."billing_pix_attempts"
    SET "status" = CASE WHEN "status" = 'CONFIRMED' THEN "status" ELSE 'AMBIGUOUS' END,
        "providerTransactionId" = COALESCE("providerTransactionId", btrim(p_provider_transaction_id)),
        "failureCode" = conflict_code,
        "failureMessage" = btrim(p_reason), "reviewRequired" = true,
        "reconciliationEvidence" = btrim(p_reconciliation_evidence),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_attempt_id;
    UPDATE public."billing_executions"
    SET "status" = CASE WHEN "pixStatus" = 'CONFIRMED' THEN "status" ELSE 'REVIEW_REQUIRED' END,
        "pixStatus" = CASE WHEN "pixStatus" = 'CONFIRMED' THEN "pixStatus" ELSE 'AMBIGUOUS' END,
        "reviewRequired" = true, "blockedCode" = conflict_code,
        "blockedReason" = btrim(p_reason), "nextAttemptAt" = NULL,
        "lastActorType" = p_actor_type, "lastActorUserId" = p_actor_user_id,
        "lastMutationReason" = btrim(p_reason), "version" = "version" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_execution_id AND "version" = p_expected_version
      AND "leaseOwner" = btrim(p_owner) AND "leaseToken" = btrim(p_token)
      AND "leaseExpiresAt" > clock_timestamp();
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
      RAISE EXCEPTION 'Billing PIX reconciliation lost compare-and-swap' USING ERRCODE = '40001';
    END IF;
  END IF;
  RETURN payment_intent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_execution_transition(
  p_execution_id UUID,
  p_expected_version INTEGER,
  p_owner TEXT,
  p_token TEXT,
  p_status public."BillingExecutionStatus",
  p_pix_status public."BillingPixStatus",
  p_delivery_status public."BillingDeliveryStatus",
  p_payment_intent_id UUID,
  p_actor_type public."BillingActorType",
  p_actor_user_id UUID,
  p_actor_principal TEXT,
  p_actor_issued_at BIGINT,
  p_actor_nonce UUID,
  p_actor_key_id TEXT,
  p_actor_signature TEXT,
  p_reason TEXT,
  p_reconciliation_evidence TEXT
) RETURNS INTEGER AS $$
DECLARE
  changed INTEGER;
  execution_record public."billing_executions"%ROWTYPE;
  arguments_digest TEXT;
BEGIN
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Billing transition requires a reason' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO execution_record FROM public."billing_executions"
  WHERE "id" = p_execution_id AND "isCurrent";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing transition target is stale or no longer current'
      USING ERRCODE = '40001';
  END IF;
  arguments_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
      public.billing_actor_canonical_value('V', 'billing-operation-args:v1')
      || public.billing_actor_canonical_value('S', btrim(p_owner))
      || public.billing_actor_canonical_value('S', btrim(p_token))
      || public.billing_actor_canonical_value('E', p_status::text)
      || public.billing_actor_canonical_value('E', p_pix_status::text)
      || public.billing_actor_canonical_value('E', p_delivery_status::text)
      || public.billing_actor_canonical_value('U', p_payment_intent_id::text)
      || public.billing_actor_canonical_value('S', btrim(p_reason))
      || public.billing_actor_canonical_value(
        'S', NULLIF(btrim(COALESCE(p_reconciliation_evidence, '')), '')
      ),
      'UTF8'
    ), 'sha256'), 'hex');
  PERFORM public.billing_execution_verify_actor(
    'billing.execution.transition', p_execution_id, execution_record."messageDispatchId", NULL,
    execution_record."receivableSetHash", p_expected_version, arguments_digest,
    p_actor_type, p_actor_user_id, p_actor_principal, p_actor_issued_at,
    p_actor_nonce, p_actor_key_id, p_actor_signature
  );

  UPDATE public."billing_executions"
  SET "status" = p_status, "pixStatus" = p_pix_status, "deliveryStatus" = p_delivery_status,
      "paymentIntentId" = p_payment_intent_id, "lastActorType" = p_actor_type,
      "lastActorUserId" = p_actor_user_id, "lastMutationReason" = btrim(p_reason),
      "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_execution_id AND "isCurrent" AND "version" = p_expected_version
    AND "leaseOwner" = btrim(p_owner) AND "leaseToken" = btrim(p_token)
    AND "leaseExpiresAt" > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN
    RAISE EXCEPTION 'Billing transition lease or expectedVersion is stale' USING ERRCODE = '40001';
  END IF;

  UPDATE public."billing_pix_attempts"
  SET "status" = p_pix_status,
      "paymentIntentId" = COALESCE(p_payment_intent_id, "paymentIntentId"),
      "reconciledAt" = CASE WHEN "status" = 'AMBIGUOUS' AND p_pix_status <> 'AMBIGUOUS'
        THEN CURRENT_TIMESTAMP ELSE "reconciledAt" END,
      "reconciliationEvidence" = CASE WHEN "status" = 'AMBIGUOUS' AND p_pix_status <> 'AMBIGUOUS'
        THEN NULLIF(btrim(COALESCE(p_reconciliation_evidence, '')), '') ELSE "reconciliationEvidence" END,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "billingExecutionId" = p_execution_id AND "isCurrent";

  IF p_payment_intent_id IS NOT NULL THEN
    UPDATE public."message_dispatches" d SET "paymentIntentId" = p_payment_intent_id
    FROM public."billing_executions" e
    WHERE e."id" = p_execution_id AND d."id" = e."messageDispatchId";
  END IF;
  RETURN p_expected_version + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_execution_amend_pending_receivable(
  p_receivable_id UUID,
  p_execution_id UUID,
  p_expected_version INTEGER,
  p_amount_text TEXT,
  p_due_date_text TEXT,
  p_description TEXT,
  p_actor_type public."BillingActorType",
  p_actor_user_id UUID,
  p_actor_principal TEXT,
  p_actor_issued_at BIGINT,
  p_actor_nonce UUID,
  p_actor_key_id TEXT,
  p_actor_signature TEXT,
  p_reason TEXT
) RETURNS UUID AS $$
DECLARE
  old_execution public."billing_executions"%ROWTYPE;
  new_execution_id UUID := gen_random_uuid();
  canonical_amount NUMERIC(12,2);
  canonical_due_date DATE;
  new_cycle TEXT;
  new_hash TEXT;
  new_key TEXT;
  target_receivable public."receivables"%ROWTYPE;
  arguments_digest TEXT;
BEGIN
  -- Lexical validation must precede PostgreSQL casts: NUMERIC and DATE otherwise accept and
  -- normalize forms such as 1e3, 01.00, 2026-1-1 and surrounding whitespace.
  IF p_amount_text IS NULL
    OR p_amount_text !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
    OR p_due_date_text IS NULL
    OR p_due_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR p_receivable_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR p_execution_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Invalid Billing receivable amendment' USING ERRCODE = '22023';
  END IF;
  BEGIN
    canonical_amount := p_amount_text::numeric(12,2);
    canonical_due_date := p_due_date_text::date;
  EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid Billing receivable amendment' USING ERRCODE = '22023';
  END;
  IF canonical_amount <= 0
    OR pg_catalog.scale(canonical_amount) > 2
    OR pg_catalog.abs(canonical_amount) > 9999999999.99
    OR canonical_due_date::text IS DISTINCT FROM p_due_date_text THEN
    RAISE EXCEPTION 'Invalid Billing receivable amendment' USING ERRCODE = '22023';
  END IF;
  new_cycle := to_char(canonical_due_date, 'YYYY-MM');
  SELECT * INTO target_receivable FROM public."receivables" WHERE "id" = p_receivable_id FOR UPDATE;
  IF NOT FOUND OR target_receivable."status" <> 'PENDENTE' THEN
    RAISE EXCEPTION 'Only a pending receivable can be amended' USING ERRCODE = '23514';
  END IF;
  SELECT e.* INTO old_execution
  FROM public."billing_executions" e
  JOIN public."billing_execution_receivables" ber ON ber."billingExecutionId" = e."id"
  WHERE ber."receivableId" = p_receivable_id AND e."isCurrent"
    AND e."id" = p_execution_id
  FOR UPDATE OF e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing amendment target is stale or no longer current'
      USING ERRCODE = '40001';
  END IF;
  arguments_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
      public.billing_actor_canonical_value('V', 'billing-operation-args:v1')
      || public.billing_actor_canonical_value('M', canonical_amount::text)
      || public.billing_actor_canonical_value('D', canonical_due_date::text)
      || public.billing_actor_canonical_value('S', p_description)
      || public.billing_actor_canonical_value('S', btrim(p_reason)),
      'UTF8'
    ), 'sha256'), 'hex');
  PERFORM public.billing_execution_verify_actor(
    'billing.receivable.amend', p_execution_id, old_execution."messageDispatchId",
    p_receivable_id, old_execution."receivableSetHash", p_expected_version, arguments_digest,
    p_actor_type, p_actor_user_id, p_actor_principal, p_actor_issued_at,
    p_actor_nonce, p_actor_key_id, p_actor_signature
  );
  IF old_execution."version" <> p_expected_version OR old_execution."pixStatus" <> 'NOT_STARTED'
    OR old_execution."paymentIntentId" IS NOT NULL
    OR old_execution."status" IN ('COMPLETED','CANCELED')
    OR EXISTS (SELECT 1 FROM public."billing_pix_attempts" WHERE "billingExecutionId" = old_execution."id")
    OR EXISTS (
      SELECT 1 FROM public."message_dispatches" WHERE "id" = old_execution."messageDispatchId"
        AND ("status" IN ('PROCESSING','SENT') OR "providerMessageId" IS NOT NULL OR "sentAt" IS NOT NULL)
    ) THEN
    RAISE EXCEPTION 'Billing execution cannot be amended after PIX or delivery activity'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public."billing_executions"
  SET "status" = 'CANCELED', "pixStatus" = 'CANCELED', "deliveryStatus" = 'CANCELED',
      "isCurrent" = false, "supersededAt" = CURRENT_TIMESTAMP,
      "lastActorType" = p_actor_type, "lastActorUserId" = p_actor_user_id,
      "lastMutationReason" = btrim(p_reason), "version" = "version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = old_execution."id" AND "version" = p_expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing amendment lost compare-and-swap' USING ERRCODE = '40001';
  END IF;

  UPDATE public."receivables" SET "amount" = canonical_amount, "dueDate" = canonical_due_date,
    "description" = p_description, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_receivable_id;

  SELECT encode(digest(string_agg(
      ber."receivableId"::text || '|' ||
      (CASE WHEN ber."receivableId" = p_receivable_id THEN canonical_amount ELSE ber."amountSnapshot" END)::numeric(12,2)::text || '|' ||
      (CASE WHEN ber."receivableId" = p_receivable_id THEN canonical_due_date ELSE ber."dueDateSnapshot" END)::text,
      E'\n' ORDER BY ber."receivableId"::text
    ), 'sha256'), 'hex')
  INTO new_hash
  FROM public."billing_execution_receivables" ber WHERE ber."billingExecutionId" = old_execution."id";
  IF EXISTS (
    SELECT 1 FROM public."billing_execution_receivables" ber
    WHERE ber."billingExecutionId" = old_execution."id"
      AND to_char(CASE WHEN ber."receivableId" = p_receivable_id THEN canonical_due_date ELSE ber."dueDateSnapshot" END, 'YYYY-MM') <> new_cycle
  ) THEN
    RAISE EXCEPTION 'Grouped Billing amendment cannot split receivables across cycles'
      USING ERRCODE = '23514';
  END IF;
  new_key := 'billing-execution:v2:' || encode(
    digest(convert_to(old_execution."clientId"::text || E'\n' || new_cycle || E'\n' || new_hash, 'UTF8'), 'sha256'),
    'hex'
  );

  INSERT INTO public."billing_executions" (
    "id", "messageDispatchId", "clientId", "executionKey", "cycleKey", "receivableSetHash",
    "authorizationMode", "status", "pixStatus", "deliveryStatus", "nextAttemptAt",
    "blockedCode", "blockedReason", "reviewRequired", "isCurrent", "supersedesExecutionId",
    "lastActorType", "lastActorUserId", "lastMutationReason", "version", "createdAt", "updatedAt"
  ) VALUES (
    new_execution_id, old_execution."messageDispatchId", old_execution."clientId", new_key, new_cycle, new_hash,
    old_execution."authorizationMode", 'REVIEW_REQUIRED', 'NOT_STARTED', 'NOT_READY', NULL,
    'FINANCIAL_IDENTITY_AMENDED', 'Revisao obrigatoria apos ajuste administrativo.', true, true, old_execution."id",
    p_actor_type, p_actor_user_id, btrim(p_reason), 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
  INSERT INTO public."billing_execution_receivables" (
    "id", "billingExecutionId", "receivableId", "clientReferenceId", "amountSnapshot",
    "dueDateSnapshot", "statusSnapshot", "referenceSnapshot", "createdAt"
  )
  SELECT gen_random_uuid(), new_execution_id, ber."receivableId", ber."clientReferenceId",
    CASE WHEN ber."receivableId" = p_receivable_id THEN canonical_amount ELSE ber."amountSnapshot" END,
    CASE WHEN ber."receivableId" = p_receivable_id THEN canonical_due_date ELSE ber."dueDateSnapshot" END,
    ber."statusSnapshot", ber."referenceSnapshot", CURRENT_TIMESTAMP
  FROM public."billing_execution_receivables" ber WHERE ber."billingExecutionId" = old_execution."id";
  RETURN new_execution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Runtime roles must be distinct from the migration/table owner. They receive
-- SELECT and EXECUTE grants during deployment, never direct DATA1 DML grants.
REVOKE INSERT, UPDATE, DELETE ON public."billing_executions" FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public."billing_execution_receivables" FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public."billing_pix_attempts" FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public."billing_execution_events" FROM PUBLIC;
REVOKE ALL ON public."billing_actor_keys" FROM PUBLIC;
REVOKE ALL ON public."billing_actor_assertions" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_actor_canonical_value(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_execution_acquire_lease(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_execution_renew_lease(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_execution_release_lease(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_execution_verify_actor(TEXT, UUID, UUID, UUID, TEXT, INTEGER, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_reserve(UUID, INTEGER, TEXT, TEXT, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_prepare_create(UUID, INTEGER, TEXT, TEXT, UUID, TEXT, public."PaymentProviderCode", public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_record_create_result(UUID, INTEGER, TEXT, TEXT, UUID, TEXT, public."PaymentProviderCode", TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_reconcile_create_result(UUID, INTEGER, TEXT, TEXT, UUID, TEXT, public."PaymentProviderCode", TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_execution_transition(UUID, INTEGER, TEXT, TEXT, public."BillingExecutionStatus", public."BillingPixStatus", public."BillingDeliveryStatus", UUID, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_execution_amend_pending_receivable(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;

COMMIT;
