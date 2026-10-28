-- Task 7C adds an immutable correlation ledger. It never rewrites the 7A
-- evidence and never settles, creates or changes a financial entity.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TYPE public."BillingPixOrphanCorrelationDecision" AS ENUM (
  'REVIEW_REQUIRED', 'CORRELATED', 'CONFLICT_DETECTED'
);

ALTER TABLE public."billing_actor_assertions"
  DROP CONSTRAINT "billing_actor_assertions_context_check",
  ADD CONSTRAINT "billing_actor_assertions_context_check" CHECK (
    "operation" IN (
      'billing.pix.reserve', 'billing.pix.prepare-create', 'billing.pix.record-create-result',
      'billing.pix.reconcile-create-result', 'billing.pix.quarantine-orphan-webhook',
      'billing.pix.analyze-orphan-webhook', 'billing.pix.correlate-orphan-webhook',
      'billing.execution.transition', 'billing.receivable.amend'
    )
    AND "expectedVersion" >= 0
    AND "financialSetDigest" ~ '^[0-9a-f]{64}$'
    AND "argumentsDigest" ~ '^[0-9a-f]{64}$'
    AND (
      ("operation" = 'billing.receivable.amend' AND "receivableId" IS NOT NULL)
      OR ("operation" <> 'billing.receivable.amend' AND "receivableId" IS NULL)
    )
    AND (
      "operation" NOT IN (
        'billing.pix.quarantine-orphan-webhook', 'billing.pix.analyze-orphan-webhook'
      )
      OR ("billingExecutionId" = "messageDispatchId" AND "expectedVersion" = 0)
    )
  );

CREATE TABLE public."billing_pix_orphan_webhook_correlation_events" (
  "id" UUID NOT NULL,
  "correlationVersion" TEXT NOT NULL,
  "orphanWebhookEventId" UUID NOT NULL,
  "decision" public."BillingPixOrphanCorrelationDecision" NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "decisionDigest" TEXT NOT NULL,
  "provider" public."PaymentProviderCode" NOT NULL,
  "providerTransactionId" TEXT NOT NULL,
  "billingPixAttemptId" UUID,
  "billingExecutionId" UUID,
  "paymentIntentId" UUID,
  "creationKey" TEXT,
  "financialSetDigest" TEXT NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "actorType" public."BillingActorType" NOT NULL,
  "actorPrincipal" TEXT NOT NULL,
  "actorKeyId" TEXT NOT NULL,
  "actorNonce" UUID NOT NULL,
  "argumentsDigest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_pix_orphan_webhook_correlation_events_digest_key" UNIQUE ("decisionDigest"),
  CONSTRAINT "billing_pix_orphan_webhook_correlation_events_nonce_key" UNIQUE ("actorNonce"),
  CONSTRAINT "billing_pix_orphan_webhook_correlation_events_evidence_fkey"
    FOREIGN KEY ("orphanWebhookEventId")
    REFERENCES public."billing_pix_orphan_webhook_events"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_events_attempt_fkey"
    FOREIGN KEY ("billingPixAttemptId")
    REFERENCES public."billing_pix_attempts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_events_execution_fkey"
    FOREIGN KEY ("billingExecutionId")
    REFERENCES public."billing_executions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_events_intent_fkey"
    FOREIGN KEY ("paymentIntentId")
    REFERENCES public."payment_intents"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_events_nonce_fkey"
    FOREIGN KEY ("actorNonce")
    REFERENCES public."billing_actor_assertions"("nonce") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_events_contract_check" CHECK (
    "correlationVersion" = 'billing-pix-orphan-correlation:v1'
    AND "reasonCode" ~ '^[A-Z][A-Z0-9_]{1,99}$'
    AND "decisionDigest" ~ '^[0-9a-f]{64}$'
    AND "providerTransactionId" <> '' AND length("providerTransactionId") <= 255
    AND "providerTransactionId" !~ '[[:cntrl:]]'
    AND "providerTransactionId" IS NFC NORMALIZED
    AND "financialSetDigest" ~ '^[0-9a-f]{64}$'
    AND "argumentsDigest" ~ '^[0-9a-f]{64}$'
    AND "expectedVersion" >= 0
    AND "actorType" = 'SYSTEM'
    AND btrim("actorPrincipal") = "actorPrincipal" AND "actorPrincipal" <> ''
    AND btrim("actorKeyId") = "actorKeyId" AND "actorKeyId" <> ''
    AND (
      ("decision" = 'REVIEW_REQUIRED' AND (
        ("billingPixAttemptId" IS NULL AND "billingExecutionId" IS NULL
          AND "paymentIntentId" IS NULL AND "creationKey" IS NULL AND "expectedVersion" = 0)
        OR ("billingPixAttemptId" IS NOT NULL AND "billingExecutionId" IS NOT NULL
          AND "creationKey" IS NOT NULL)
      ))
      OR ("decision" IN ('CORRELATED', 'CONFLICT_DETECTED')
        AND "billingPixAttemptId" IS NOT NULL AND "billingExecutionId" IS NOT NULL
        AND "creationKey" IS NOT NULL)
    )
  )
);

CREATE INDEX "billing_pix_orphan_correlation_events_evidence_idx"
  ON public."billing_pix_orphan_webhook_correlation_events"("orphanWebhookEventId", "createdAt");
CREATE INDEX "billing_pix_orphan_correlation_events_provider_transaction_idx"
  ON public."billing_pix_orphan_webhook_correlation_events"("provider", "providerTransactionId");
CREATE INDEX "billing_pix_orphan_correlation_events_attempt_idx"
  ON public."billing_pix_orphan_webhook_correlation_events"("billingPixAttemptId");
CREATE INDEX "billing_pix_orphan_correlation_events_execution_idx"
  ON public."billing_pix_orphan_webhook_correlation_events"("billingExecutionId");
CREATE INDEX "billing_pix_orphan_correlation_events_decision_idx"
  ON public."billing_pix_orphan_webhook_correlation_events"("decision", "createdAt");

CREATE TABLE public."billing_pix_orphan_webhook_correlation_claims" (
  "orphanWebhookEventId" UUID NOT NULL,
  "decisionEventId" UUID NOT NULL,
  "billingPixAttemptId" UUID NOT NULL,
  "billingExecutionId" UUID NOT NULL,
  "paymentIntentId" UUID,
  "provider" public."PaymentProviderCode" NOT NULL,
  "providerTransactionId" TEXT NOT NULL,
  "creationKey" TEXT NOT NULL,
  "financialSetDigest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_claims_pkey"
    PRIMARY KEY ("orphanWebhookEventId"),
  CONSTRAINT "billing_pix_orphan_webhook_correlation_claims_decision_key"
    UNIQUE ("decisionEventId"),
  CONSTRAINT "billing_pix_orphan_webhook_correlation_claims_evidence_fkey"
    FOREIGN KEY ("orphanWebhookEventId")
    REFERENCES public."billing_pix_orphan_webhook_events"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_claims_decision_fkey"
    FOREIGN KEY ("decisionEventId")
    REFERENCES public."billing_pix_orphan_webhook_correlation_events"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_claims_attempt_fkey"
    FOREIGN KEY ("billingPixAttemptId")
    REFERENCES public."billing_pix_attempts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_claims_execution_fkey"
    FOREIGN KEY ("billingExecutionId")
    REFERENCES public."billing_executions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_claims_intent_fkey"
    FOREIGN KEY ("paymentIntentId")
    REFERENCES public."payment_intents"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "billing_pix_orphan_webhook_correlation_claims_contract_check" CHECK (
    "providerTransactionId" <> '' AND length("providerTransactionId") <= 255
    AND "providerTransactionId" !~ '[[:cntrl:]]'
    AND "providerTransactionId" IS NFC NORMALIZED
    AND btrim("creationKey") = "creationKey" AND "creationKey" <> ''
    AND "financialSetDigest" ~ '^[0-9a-f]{64}$'
  )
);

CREATE INDEX "billing_pix_orphan_correlation_claims_attempt_idx"
  ON public."billing_pix_orphan_webhook_correlation_claims"("billingPixAttemptId");
CREATE INDEX "billing_pix_orphan_correlation_claims_execution_idx"
  ON public."billing_pix_orphan_webhook_correlation_claims"("billingExecutionId");
CREATE INDEX "billing_pix_orphan_correlation_claims_provider_transaction_idx"
  ON public."billing_pix_orphan_webhook_correlation_claims"("provider", "providerTransactionId");

CREATE FUNCTION public.billing_pix_orphan_correlation_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Billing orphan webhook correlation records are immutable'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_pix_orphan_correlation_events_guard_trigger
BEFORE UPDATE OR DELETE ON public."billing_pix_orphan_webhook_correlation_events"
FOR EACH ROW EXECUTE FUNCTION public.billing_pix_orphan_correlation_guard();
CREATE TRIGGER billing_pix_orphan_correlation_claims_guard_trigger
BEFORE UPDATE OR DELETE ON public."billing_pix_orphan_webhook_correlation_claims"
FOR EACH ROW EXECUTE FUNCTION public.billing_pix_orphan_correlation_guard();

CREATE FUNCTION public.billing_pix_orphan_correlation_uuid(p_digest TEXT) RETURNS UUID AS $$
DECLARE identity_hex TEXT;
BEGIN
  IF p_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid Billing orphan correlation digest' USING ERRCODE = '22023';
  END IF;
  identity_hex := substring(p_digest, 1, 12) || '5' || substring(p_digest, 14, 3)
    || '8' || substring(p_digest, 18, 15);
  RETURN (
    substring(identity_hex, 1, 8) || '-' || substring(identity_hex, 9, 4) || '-'
    || substring(identity_hex, 13, 4) || '-' || substring(identity_hex, 17, 4) || '-'
    || substring(identity_hex, 21, 12)
  )::uuid;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_pix_orphan_correlation_verify_actor(
  p_operation TEXT, p_execution_id UUID, p_message_dispatch_id UUID,
  p_financial_set_digest TEXT, p_expected_version INTEGER, p_arguments_digest TEXT,
  p_actor_type public."BillingActorType", p_actor_user_id UUID, p_actor_principal TEXT,
  p_actor_issued_at BIGINT, p_actor_nonce UUID, p_actor_key_id TEXT, p_actor_signature TEXT
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
      'billing.pix.analyze-orphan-webhook', 'billing.pix.correlate-orphan-webhook'
    ) OR p_execution_id IS NULL OR p_message_dispatch_id IS NULL
    OR p_execution_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR p_message_dispatch_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR p_expected_version < 0 OR p_financial_set_digest !~ '^[0-9a-f]{64}$'
    OR p_arguments_digest !~ '^[0-9a-f]{64}$'
    OR p_actor_type IS DISTINCT FROM 'SYSTEM' OR p_actor_user_id IS NOT NULL
    OR p_actor_principal IS DISTINCT FROM btrim(p_actor_principal)
    OR btrim(COALESCE(p_actor_principal, '')) = ''
    OR p_actor_key_id IS DISTINCT FROM btrim(p_actor_key_id)
    OR btrim(COALESCE(p_actor_key_id, '')) = ''
    OR p_actor_nonce IS NULL OR p_actor_nonce = '00000000-0000-0000-0000-000000000000'::uuid
    OR abs(extract(epoch FROM clock_timestamp())::bigint - p_actor_issued_at) > 300
    OR p_actor_signature !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid Billing orphan correlation actor context' USING ERRCODE = '28000';
  END IF;
  SELECT "secret" INTO signing_secret FROM public."billing_actor_keys"
  WHERE "actorType" = p_actor_type AND "keyId" = p_actor_key_id AND "enabled";
  IF signing_secret IS NULL THEN
    RAISE EXCEPTION 'Unknown Billing actor signing key' USING ERRCODE = '28000';
  END IF;
  canonical_payload := public.billing_actor_canonical_value('V', 'billing-actor:v2')
    || public.billing_actor_canonical_value('E', p_operation)
    || public.billing_actor_canonical_value('U', p_execution_id::text)
    || public.billing_actor_canonical_value('U', p_message_dispatch_id::text)
    || public.billing_actor_canonical_value('U', NULL)
    || public.billing_actor_canonical_value('H', p_financial_set_digest)
    || public.billing_actor_canonical_value('I', p_expected_version::text)
    || public.billing_actor_canonical_value('H', p_arguments_digest)
    || public.billing_actor_canonical_value('E', p_actor_type::text)
    || public.billing_actor_canonical_value('U', NULL)
    || public.billing_actor_canonical_value('S', p_actor_principal)
    || public.billing_actor_canonical_value('I', p_actor_issued_at::text)
    || public.billing_actor_canonical_value('U', p_actor_nonce::text)
    || public.billing_actor_canonical_value('S', p_actor_key_id);
  expected_signature := public.hmac(convert_to(canonical_payload, 'UTF8'), signing_secret, 'sha256');
  supplied_signature := decode(p_actor_signature, 'hex');
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
      p_actor_nonce, p_actor_type, NULL, p_actor_principal, p_actor_key_id, p_operation,
      p_execution_id, p_message_dispatch_id, NULL, p_financial_set_digest,
      p_expected_version, p_arguments_digest, p_actor_issued_at
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Billing actor assertion was already consumed' USING ERRCODE = '28000';
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_pix_orphan_webhook_correlation_context(p_evidence_id UUID)
RETURNS TABLE (
  "evidenceId" UUID, provider public."PaymentProviderCode", "providerTransactionId" TEXT,
  "rawBodyDigest" TEXT, "attemptId" UUID, "executionId" UUID, "messageDispatchId" UUID,
  "paymentIntentId" UUID, "creationKey" TEXT, "financialSetDigest" TEXT,
  "expectedVersion" INTEGER, "attemptStatus" public."BillingPixStatus",
  "executionStatus" public."BillingExecutionStatus", "leaseExpiresAt" TIMESTAMP(3)
) AS $$
BEGIN
  IF p_evidence_id IS NULL THEN
    RAISE EXCEPTION 'Orphan webhook evidence id is required' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT e."id", e."provider", e."providerTransactionId", e."rawBodyDigest",
    a."id", x."id", x."messageDispatchId", a."paymentIntentId", a."creationKey",
    x."receivableSetHash"::text, x."version", a."status", x."status", x."leaseExpiresAt"
  FROM public."billing_pix_orphan_webhook_events" e
  LEFT JOIN public."billing_pix_attempts" a
    ON a."provider" = e."provider"
   AND a."providerTransactionId" = e."providerTransactionId"
   AND a."isCurrent"
  LEFT JOIN public."billing_executions" x ON x."id" = a."billingExecutionId"
  WHERE e."id" = p_evidence_id
    AND EXISTS (
      SELECT 1 FROM public."billing_actor_assertions" s
      WHERE s."nonce" = e."actorNonce" AND s."actorType" = 'WEBHOOK'
        AND s."operation" = 'billing.pix.quarantine-orphan-webhook'
        AND s."billingExecutionId" = e."id" AND s."messageDispatchId" = e."id"
        AND s."financialSetDigest" = e."rawBodyDigest"
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated orphan webhook evidence was not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_pix_analyze_orphan_webhook(
  p_evidence_id UUID, p_reason_code TEXT,
  p_actor_type public."BillingActorType", p_actor_user_id UUID, p_actor_principal TEXT,
  p_actor_issued_at BIGINT, p_actor_nonce UUID, p_actor_key_id TEXT,
  p_actor_signature TEXT, p_arguments_digest TEXT
) RETURNS TABLE (decision TEXT, "decisionEventId" UUID, inserted BOOLEAN) AS $$
DECLARE
  evidence_record public."billing_pix_orphan_webhook_events"%ROWTYPE;
  computed_arguments_digest TEXT;
  decision_digest TEXT;
  decision_id UUID;
  inserted_count INTEGER;
  existing_claim UUID;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'Orphan correlation analysis requires SERIALIZABLE isolation'
      USING ERRCODE = '25001';
  END IF;
  IF p_reason_code IS DISTINCT FROM 'NO_DURABLE_ATTEMPT' THEN
    RAISE EXCEPTION 'Invalid orphan correlation review reason' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('pix:orphan-evidence:' || p_evidence_id::text, 0));
  SELECT e.* INTO evidence_record FROM public."billing_pix_orphan_webhook_events" e
  WHERE e."id" = p_evidence_id FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public."billing_actor_assertions" s
    WHERE s."nonce" = evidence_record."actorNonce" AND s."actorType" = 'WEBHOOK'
      AND s."operation" = 'billing.pix.quarantine-orphan-webhook'
      AND s."billingExecutionId" = evidence_record."id"
      AND s."financialSetDigest" = evidence_record."rawBodyDigest"
  ) THEN
    RAISE EXCEPTION 'Authenticated orphan webhook evidence was not found' USING ERRCODE = 'P0002';
  END IF;
  computed_arguments_digest := encode(digest(convert_to(
      public.billing_actor_canonical_value('V', 'billing-operation-args:v1')
      || public.billing_actor_canonical_value('U', p_evidence_id::text)
      || public.billing_actor_canonical_value('E', 'REVIEW_REQUIRED')
      || public.billing_actor_canonical_value('E', p_reason_code), 'UTF8'), 'sha256'), 'hex');
  IF computed_arguments_digest IS DISTINCT FROM p_arguments_digest THEN
    RAISE EXCEPTION 'Billing orphan analysis arguments digest mismatch' USING ERRCODE = '28000';
  END IF;
  PERFORM public.billing_pix_orphan_correlation_verify_actor(
    'billing.pix.analyze-orphan-webhook', p_evidence_id, p_evidence_id,
    evidence_record."rawBodyDigest", 0, p_arguments_digest,
    p_actor_type, p_actor_user_id, p_actor_principal, p_actor_issued_at,
    p_actor_nonce, p_actor_key_id, p_actor_signature
  );
  SELECT c."decisionEventId" INTO existing_claim
  FROM public."billing_pix_orphan_webhook_correlation_claims" c
  WHERE c."orphanWebhookEventId" = p_evidence_id;
  IF existing_claim IS NOT NULL THEN
    RETURN QUERY SELECT 'ALREADY_CORRELATED'::text, existing_claim, false;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."billing_pix_attempts" a
    WHERE a."provider" = evidence_record."provider"
      AND a."providerTransactionId" = evidence_record."providerTransactionId"
      AND a."isCurrent"
  ) THEN
    RETURN QUERY SELECT 'RETRY_LATER'::text, NULL::uuid, false;
    RETURN;
  END IF;
  decision_digest := encode(digest(convert_to(
      public.billing_actor_canonical_value('V', 'billing-pix-orphan-correlation-decision:v1')
      || public.billing_actor_canonical_value('U', p_evidence_id::text)
      || public.billing_actor_canonical_value('E', 'REVIEW_REQUIRED')
      || public.billing_actor_canonical_value('E', p_reason_code)
      || public.billing_actor_canonical_value('U', NULL), 'UTF8'), 'sha256'), 'hex');
  decision_id := public.billing_pix_orphan_correlation_uuid(decision_digest);
  INSERT INTO public."billing_pix_orphan_webhook_correlation_events" (
    "id", "correlationVersion", "orphanWebhookEventId", "decision", "reasonCode",
    "decisionDigest", "provider", "providerTransactionId", "financialSetDigest",
    "expectedVersion", "actorType", "actorPrincipal", "actorKeyId", "actorNonce",
    "argumentsDigest"
  ) VALUES (
    decision_id, 'billing-pix-orphan-correlation:v1', p_evidence_id, 'REVIEW_REQUIRED',
    p_reason_code, decision_digest, evidence_record."provider",
    evidence_record."providerTransactionId", evidence_record."rawBodyDigest", 0,
    p_actor_type, p_actor_principal, p_actor_key_id, p_actor_nonce, p_arguments_digest
  ) ON CONFLICT ("decisionDigest") DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  SELECT "id" INTO decision_id FROM public."billing_pix_orphan_webhook_correlation_events"
  WHERE "decisionDigest" = decision_digest;
  RETURN QUERY SELECT 'REVIEW_REQUIRED'::text, decision_id, inserted_count = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION public.billing_pix_correlate_orphan_webhook(
  p_evidence_id UUID, p_expected_attempt_id UUID, p_expected_execution_id UUID,
  p_expected_payment_intent_id UUID, p_expected_version INTEGER,
  p_owner TEXT, p_token TEXT, p_expected_creation_key TEXT,
  p_actor_type public."BillingActorType", p_actor_user_id UUID, p_actor_principal TEXT,
  p_actor_issued_at BIGINT, p_actor_nonce UUID, p_actor_key_id TEXT,
  p_actor_signature TEXT, p_arguments_digest TEXT
) RETURNS TABLE (
  decision TEXT, "decisionEventId" UUID, inserted BOOLEAN, "reconciliationEligible" BOOLEAN
) AS $$
DECLARE
  evidence_record public."billing_pix_orphan_webhook_events"%ROWTYPE;
  attempt_record public."billing_pix_attempts"%ROWTYPE;
  execution_record public."billing_executions"%ROWTYPE;
  intent_record public."payment_intents"%ROWTYPE;
  claim_record public."billing_pix_orphan_webhook_correlation_claims"%ROWTYPE;
  computed_arguments_digest TEXT;
  expected_set_hash TEXT;
  expected_execution_key TEXT;
  expected_creation_key TEXT;
  total_amount NUMERIC(12,2);
  receivable_count INTEGER;
  group_count INTEGER;
  reason_code TEXT := NULL;
  result_decision public."BillingPixOrphanCorrelationDecision" := 'CORRELATED';
  decision_digest TEXT;
  decision_id UUID;
  inserted_count INTEGER;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'Orphan correlation requires SERIALIZABLE isolation' USING ERRCODE = '25001';
  END IF;
  IF p_expected_version < 0 OR btrim(COALESCE(p_owner, '')) = ''
    OR btrim(COALESCE(p_token, '')) = '' OR btrim(COALESCE(p_expected_creation_key, '')) = '' THEN
    RAISE EXCEPTION 'Invalid orphan correlation request' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('pix:orphan-evidence:' || p_evidence_id::text, 0));
  SELECT e.* INTO evidence_record FROM public."billing_pix_orphan_webhook_events" e
  WHERE e."id" = p_evidence_id FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public."billing_actor_assertions" s
    WHERE s."nonce" = evidence_record."actorNonce" AND s."actorType" = 'WEBHOOK'
      AND s."operation" = 'billing.pix.quarantine-orphan-webhook'
      AND s."billingExecutionId" = evidence_record."id"
      AND s."financialSetDigest" = evidence_record."rawBodyDigest"
  ) THEN
    RAISE EXCEPTION 'Authenticated orphan webhook evidence was not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT a.* INTO attempt_record FROM public."billing_pix_attempts" a
  WHERE a."provider" = evidence_record."provider"
    AND a."providerTransactionId" = evidence_record."providerTransactionId"
    AND a."isCurrent" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Durable Billing PIX attempt disappeared' USING ERRCODE = '40001';
  END IF;
  IF attempt_record."id" IS DISTINCT FROM p_expected_attempt_id
    OR attempt_record."billingExecutionId" IS DISTINCT FROM p_expected_execution_id THEN
    RAISE EXCEPTION 'Billing orphan correlation expectation is stale' USING ERRCODE = '40001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('pix:receivable:' || ber."receivableId"::text, 0))
  FROM public."billing_execution_receivables" ber
  WHERE ber."billingExecutionId" = attempt_record."billingExecutionId"
  ORDER BY ber."receivableId";
  PERFORM r."id" FROM public."receivables" r
  JOIN public."billing_execution_receivables" ber ON ber."receivableId" = r."id"
  WHERE ber."billingExecutionId" = attempt_record."billingExecutionId"
  ORDER BY r."id" FOR UPDATE OF r;
  SELECT x.* INTO execution_record FROM public."billing_executions" x
  WHERE x."id" = attempt_record."billingExecutionId" FOR UPDATE;
  IF NOT FOUND OR execution_record."version" <> p_expected_version
    OR execution_record."leaseOwner" IS DISTINCT FROM btrim(p_owner)
    OR execution_record."leaseToken" IS DISTINCT FROM btrim(p_token)
    OR execution_record."leaseExpiresAt" <= clock_timestamp() THEN
    RAISE EXCEPTION 'Billing orphan correlation lease or CAS is stale' USING ERRCODE = '40001';
  END IF;
  computed_arguments_digest := encode(digest(convert_to(
      public.billing_actor_canonical_value('V', 'billing-operation-args:v1')
      || public.billing_actor_canonical_value('S', btrim(p_owner))
      || public.billing_actor_canonical_value('S', btrim(p_token))
      || public.billing_actor_canonical_value('U', p_evidence_id::text)
      || public.billing_actor_canonical_value('U', p_expected_attempt_id::text)
      || public.billing_actor_canonical_value('S', btrim(p_expected_creation_key))
      || public.billing_actor_canonical_value('E', evidence_record."provider"::text)
      || public.billing_actor_canonical_value('S', evidence_record."providerTransactionId")
      || public.billing_actor_canonical_value('U', p_expected_payment_intent_id::text),
      'UTF8'), 'sha256'), 'hex');
  IF computed_arguments_digest IS DISTINCT FROM p_arguments_digest THEN
    RAISE EXCEPTION 'Billing orphan correlation arguments digest mismatch' USING ERRCODE = '28000';
  END IF;
  PERFORM public.billing_pix_orphan_correlation_verify_actor(
    'billing.pix.correlate-orphan-webhook', execution_record."id",
    execution_record."messageDispatchId", execution_record."receivableSetHash",
    p_expected_version, p_arguments_digest, p_actor_type, p_actor_user_id,
    p_actor_principal, p_actor_issued_at, p_actor_nonce, p_actor_key_id, p_actor_signature
  );
  SELECT c.* INTO claim_record FROM public."billing_pix_orphan_webhook_correlation_claims" c
  WHERE c."orphanWebhookEventId" = p_evidence_id;
  IF FOUND AND claim_record."billingPixAttemptId" = attempt_record."id"
    AND claim_record."billingExecutionId" = execution_record."id" THEN
    RETURN QUERY SELECT 'ALREADY_CORRELATED'::text, claim_record."decisionEventId", false,
      attempt_record."status" = 'AMBIGUOUS' AND attempt_record."paymentIntentId" IS NULL;
    RETURN;
  ELSIF FOUND THEN
    result_decision := 'CONFLICT_DETECTED';
    reason_code := 'CLAIM_IDENTITY_CONFLICT';
  END IF;
  SELECT encode(digest(string_agg(
      ber."receivableId"::text || '|' || ber."amountSnapshot"::numeric(12,2)::text || '|'
      || ber."dueDateSnapshot"::text, E'\n' ORDER BY ber."receivableId"::text
    ), 'sha256'), 'hex'), sum(ber."amountSnapshot"), count(*)::integer
  INTO expected_set_hash, total_amount, receivable_count
  FROM public."billing_execution_receivables" ber
  WHERE ber."billingExecutionId" = execution_record."id";
  expected_execution_key := 'billing-execution:v2:' || encode(digest(convert_to(
    execution_record."clientId"::text || E'\n' || execution_record."cycleKey" || E'\n'
    || expected_set_hash, 'UTF8'), 'sha256'), 'hex');
  expected_creation_key := 'bpx1:' || encode(digest(convert_to(
      public.billing_actor_canonical_value('V', 'billing-pix-creation:v1')
      || public.billing_actor_canonical_value('U', execution_record."id"::text)
      || public.billing_actor_canonical_value('E', evidence_record."provider"::text)
      || public.billing_actor_canonical_value('S', execution_record."cycleKey")
      || public.billing_actor_canonical_value('H', execution_record."receivableSetHash")
      || public.billing_actor_canonical_value('M', total_amount::numeric(12,2)::text)
      || public.billing_actor_canonical_value('V', 'billing-pix-expiration:v1'),
      'UTF8'), 'sha256'), 'hex');
  IF reason_code IS NULL AND (
    NOT execution_record."isCurrent" OR execution_record."supersededAt" IS NOT NULL
    OR execution_record."status" NOT IN ('PROCESSING','REVIEW_REQUIRED','WAITING_PIX')
    OR attempt_record."status" NOT IN ('CREATING','AMBIGUOUS','CONFIRMED')
    OR execution_record."receivableSetHash" IS DISTINCT FROM expected_set_hash
    OR execution_record."executionKey" IS DISTINCT FROM expected_execution_key
    OR attempt_record."creationKey" IS DISTINCT FROM expected_creation_key
    OR attempt_record."creationKey" IS DISTINCT FROM btrim(p_expected_creation_key)
  ) THEN reason_code := 'FINANCIAL_IDENTITY_MISMATCH'; END IF;
  IF reason_code IS NULL AND EXISTS (
    SELECT 1 FROM public."billing_execution_receivables" ber
    JOIN public."receivables" r ON r."id" = ber."receivableId"
    JOIN public."client_references" cr ON cr."id" = ber."clientReferenceId"
    WHERE ber."billingExecutionId" = execution_record."id"
      AND (r."clientId" IS DISTINCT FROM execution_record."clientId"
        OR cr."clientId" IS DISTINCT FROM execution_record."clientId"
        OR r."clientReferenceId" IS DISTINCT FROM ber."clientReferenceId"
        OR r."status" <> 'PENDENTE' OR r."amount" IS DISTINCT FROM ber."amountSnapshot"
        OR r."dueDate" IS DISTINCT FROM ber."dueDateSnapshot"
        OR cr."reference" IS DISTINCT FROM ber."referenceSnapshot")
  ) THEN reason_code := 'FINANCIAL_SNAPSHOT_MISMATCH'; END IF;
  IF reason_code IS NULL AND (
    attempt_record."paymentIntentId" IS DISTINCT FROM execution_record."paymentIntentId"
    OR attempt_record."paymentIntentId" IS DISTINCT FROM p_expected_payment_intent_id
  ) THEN reason_code := 'PAYMENT_INTENT_LINK_MISMATCH'; END IF;
  IF reason_code IS NULL AND attempt_record."paymentIntentId" IS NOT NULL THEN
    SELECT pi.* INTO intent_record FROM public."payment_intents" pi
    WHERE pi."id" = attempt_record."paymentIntentId" FOR UPDATE;
    IF NOT FOUND OR intent_record."provider" IS DISTINCT FROM evidence_record."provider"
      OR intent_record."providerTransactionId" IS DISTINCT FROM evidence_record."providerTransactionId"
      OR intent_record."creationKey" IS DISTINCT FROM attempt_record."creationKey"
      OR intent_record."origin" <> 'BILLING' OR intent_record."amount" IS DISTINCT FROM total_amount
      OR intent_record."status" NOT IN ('CREATED','WAITING_PAYMENT') THEN
      reason_code := 'PAYMENT_INTENT_IDENTITY_MISMATCH';
    ELSIF receivable_count = 1 THEN
      IF intent_record."paymentGroupId" IS NOT NULL OR NOT EXISTS (
        SELECT 1 FROM public."billing_execution_receivables" ber
        WHERE ber."billingExecutionId" = execution_record."id"
          AND ber."receivableId" = intent_record."receivableId"
      ) THEN reason_code := 'PAYMENT_INTENT_SET_MISMATCH'; END IF;
    ELSE
      SELECT count(*)::integer INTO group_count FROM public."payment_group_items"
      WHERE "paymentGroupId" = intent_record."paymentGroupId";
      IF intent_record."receivableId" IS NOT NULL OR intent_record."paymentGroupId" IS NULL
        OR group_count <> receivable_count OR EXISTS (
          SELECT 1 FROM public."payment_group_items" pgi
          WHERE pgi."paymentGroupId" = intent_record."paymentGroupId"
            AND NOT EXISTS (
              SELECT 1 FROM public."billing_execution_receivables" ber
              WHERE ber."billingExecutionId" = execution_record."id"
                AND ber."receivableId" = pgi."receivableId"
                AND ber."amountSnapshot" = pgi."amount"
            )
        ) THEN reason_code := 'PAYMENT_INTENT_SET_MISMATCH'; END IF;
    END IF;
  END IF;
  IF reason_code IS NULL AND EXISTS (
    SELECT 1 FROM public."billing_execution_receivables" ber
    JOIN public."payment_intents" pi ON pi."receivableId" = ber."receivableId"
    WHERE ber."billingExecutionId" = execution_record."id"
      AND pi."id" IS DISTINCT FROM attempt_record."paymentIntentId"
      AND pi."status" IN ('CREATED','WAITING_PAYMENT','PAID','REFUNDED')
    UNION ALL
    SELECT 1 FROM public."billing_execution_receivables" ber
    JOIN public."payment_group_items" pgi ON pgi."receivableId" = ber."receivableId"
    JOIN public."payment_intents" pi ON pi."paymentGroupId" = pgi."paymentGroupId"
    WHERE ber."billingExecutionId" = execution_record."id"
      AND pi."id" IS DISTINCT FROM attempt_record."paymentIntentId"
      AND pi."status" IN ('CREATED','WAITING_PAYMENT','PAID','REFUNDED')
  ) THEN reason_code := 'OVERLAPPING_PAYMENT_INTENT'; END IF;
  IF reason_code IS NOT NULL AND result_decision <> 'CONFLICT_DETECTED' THEN
    result_decision := 'REVIEW_REQUIRED';
  ELSIF reason_code IS NULL THEN
    reason_code := 'DURABLE_ATTEMPT_MATCH';
  END IF;
  decision_digest := encode(digest(convert_to(
      public.billing_actor_canonical_value('V', 'billing-pix-orphan-correlation-decision:v1')
      || public.billing_actor_canonical_value('U', p_evidence_id::text)
      || public.billing_actor_canonical_value('E', result_decision::text)
      || public.billing_actor_canonical_value('E', reason_code)
      || public.billing_actor_canonical_value('U', attempt_record."id"::text)
      || public.billing_actor_canonical_value('U', execution_record."id"::text)
      || public.billing_actor_canonical_value('U', attempt_record."paymentIntentId"::text),
      'UTF8'), 'sha256'), 'hex');
  decision_id := public.billing_pix_orphan_correlation_uuid(decision_digest);
  INSERT INTO public."billing_pix_orphan_webhook_correlation_events" (
    "id", "correlationVersion", "orphanWebhookEventId", "decision", "reasonCode",
    "decisionDigest", "provider", "providerTransactionId", "billingPixAttemptId",
    "billingExecutionId", "paymentIntentId", "creationKey", "financialSetDigest",
    "expectedVersion", "actorType", "actorPrincipal", "actorKeyId", "actorNonce",
    "argumentsDigest"
  ) VALUES (
    decision_id, 'billing-pix-orphan-correlation:v1', p_evidence_id, result_decision,
    reason_code, decision_digest, evidence_record."provider",
    evidence_record."providerTransactionId", attempt_record."id", execution_record."id",
    attempt_record."paymentIntentId", attempt_record."creationKey",
    execution_record."receivableSetHash", p_expected_version, p_actor_type,
    p_actor_principal, p_actor_key_id, p_actor_nonce, p_arguments_digest
  ) ON CONFLICT ("decisionDigest") DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  SELECT "id" INTO decision_id FROM public."billing_pix_orphan_webhook_correlation_events"
  WHERE "decisionDigest" = decision_digest;
  IF result_decision = 'CORRELATED' THEN
    INSERT INTO public."billing_pix_orphan_webhook_correlation_claims" (
      "orphanWebhookEventId", "decisionEventId", "billingPixAttemptId",
      "billingExecutionId", "paymentIntentId", "provider", "providerTransactionId",
      "creationKey", "financialSetDigest"
    ) VALUES (
      p_evidence_id, decision_id, attempt_record."id", execution_record."id",
      attempt_record."paymentIntentId", evidence_record."provider",
      evidence_record."providerTransactionId", attempt_record."creationKey",
      execution_record."receivableSetHash"
    ) ON CONFLICT ("orphanWebhookEventId") DO NOTHING;
    SELECT c.* INTO claim_record FROM public."billing_pix_orphan_webhook_correlation_claims" c
    WHERE c."orphanWebhookEventId" = p_evidence_id;
    IF claim_record."billingPixAttemptId" IS DISTINCT FROM attempt_record."id"
      OR claim_record."billingExecutionId" IS DISTINCT FROM execution_record."id" THEN
      RAISE EXCEPTION 'Billing orphan webhook claim identity conflict' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN QUERY SELECT result_decision::text, decision_id, inserted_count = 1,
    result_decision = 'CORRELATED' AND attempt_record."status" = 'AMBIGUOUS'
      AND attempt_record."paymentIntentId" IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON public."billing_pix_orphan_webhook_correlation_events" FROM PUBLIC;
REVOKE ALL ON public."billing_pix_orphan_webhook_correlation_claims" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_orphan_correlation_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_orphan_correlation_uuid(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_orphan_correlation_verify_actor(
  TEXT, UUID, UUID, TEXT, INTEGER, TEXT, public."BillingActorType", UUID,
  TEXT, BIGINT, UUID, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_orphan_webhook_correlation_context(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_analyze_orphan_webhook(
  UUID, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_correlate_orphan_webhook(
  UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT,
  public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC;

COMMIT;
