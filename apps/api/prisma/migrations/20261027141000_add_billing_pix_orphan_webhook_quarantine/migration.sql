-- Task 7A installs only the immutable orphan-webhook evidence contract. The
-- operational endpoint and correlation workflow are intentionally unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

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
    AND (
      ("operation" = 'billing.receivable.amend' AND "receivableId" IS NOT NULL)
      OR ("operation" <> 'billing.receivable.amend' AND "receivableId" IS NULL)
    )
    AND (
      "operation" <> 'billing.pix.quarantine-orphan-webhook'
      OR (
        "billingExecutionId" = "messageDispatchId"
        AND "expectedVersion" = 0
      )
    )
  );

CREATE TABLE public."billing_pix_orphan_webhook_events" (
  "id" UUID NOT NULL,
  "evidenceVersion" TEXT NOT NULL,
  "provider" public."PaymentProviderCode" NOT NULL,
  "providerTransactionId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "externalStatus" TEXT NOT NULL,
  "rawBodyDigest" TEXT NOT NULL,
  "rawBodyBytes" INTEGER NOT NULL,
  "receivedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "actorPrincipal" TEXT NOT NULL,
  "actorKeyId" TEXT NOT NULL,
  "actorNonce" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_pix_orphan_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_pix_orphan_webhook_events_actorNonce_key" UNIQUE ("actorNonce"),
  CONSTRAINT "billing_pix_orphan_webhook_events_identity_key"
    UNIQUE ("provider", "providerTransactionId", "eventKey", "rawBodyDigest"),
  CONSTRAINT "billing_pix_orphan_webhook_events_actorNonce_fkey"
    FOREIGN KEY ("actorNonce") REFERENCES public."billing_actor_assertions"("nonce")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "billing_pix_orphan_webhook_events_contract_check" CHECK (
    "evidenceVersion" = 'billing-pix-orphan-webhook:v1'
    AND "providerTransactionId" = btrim("providerTransactionId")
    AND "providerTransactionId" <> '' AND length("providerTransactionId") <= 255
    AND "eventKey" = btrim("eventKey") AND "eventKey" <> '' AND length("eventKey") <= 255
    AND "externalStatus" = btrim("externalStatus")
    AND "externalStatus" <> '' AND length("externalStatus") <= 255
    AND "providerTransactionId" !~ '[[:cntrl:]]'
    AND "eventKey" !~ '[[:cntrl:]]' AND "externalStatus" !~ '[[:cntrl:]]'
    AND "providerTransactionId" IS NFC NORMALIZED
    AND "eventKey" IS NFC NORMALIZED AND "externalStatus" IS NFC NORMALIZED
    AND "rawBodyDigest" ~ '^[0-9a-f]{64}$'
    AND "rawBodyBytes" BETWEEN 1 AND 1048576
    AND "receivedAt" = date_trunc('milliseconds', "receivedAt")
    AND "actorPrincipal" = "provider"::text || ':' || "eventKey"
    AND "actorKeyId" = btrim("actorKeyId") AND "actorKeyId" <> ''
  )
);

CREATE INDEX "billing_pix_orphan_webhook_events_provider_transaction_idx"
  ON public."billing_pix_orphan_webhook_events"("provider", "providerTransactionId");
CREATE INDEX "billing_pix_orphan_webhook_events_receivedAt_idx"
  ON public."billing_pix_orphan_webhook_events"("receivedAt");

CREATE FUNCTION public.billing_pix_orphan_webhook_event_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Billing orphan webhook evidence is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER billing_pix_orphan_webhook_event_guard_trigger
BEFORE UPDATE OR DELETE ON public."billing_pix_orphan_webhook_events"
FOR EACH ROW EXECUTE FUNCTION public.billing_pix_orphan_webhook_event_guard();

CREATE FUNCTION public.billing_pix_quarantine_orphan_webhook(
  p_event_id UUID,
  p_provider public."PaymentProviderCode",
  p_provider_transaction_id TEXT,
  p_event_key TEXT,
  p_external_status TEXT,
  p_raw_body_digest TEXT,
  p_raw_body_bytes INTEGER,
  p_received_at TIMESTAMPTZ,
  p_actor_type public."BillingActorType",
  p_actor_user_id UUID,
  p_actor_principal TEXT,
  p_actor_issued_at BIGINT,
  p_actor_nonce UUID,
  p_actor_key_id TEXT,
  p_actor_signature TEXT,
  p_arguments_digest TEXT
) RETURNS TABLE ("eventId" UUID, inserted BOOLEAN) AS $$
DECLARE
  signing_secret BYTEA;
  expected_signature BYTEA;
  supplied_signature BYTEA;
  canonical_received_at TEXT;
  canonical_arguments TEXT;
  computed_arguments_digest TEXT;
  identity_payload TEXT;
  identity_hex TEXT;
  expected_event_id UUID;
  canonical_payload TEXT;
  signature_difference INTEGER := 0;
  signature_index INTEGER;
  inserted_count INTEGER;
BEGIN
  IF p_event_id IS NULL OR p_event_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR p_provider IS NULL
    OR p_actor_type IS DISTINCT FROM 'WEBHOOK'
    OR p_actor_user_id IS NOT NULL
    OR p_provider_transaction_id IS DISTINCT FROM btrim(p_provider_transaction_id)
    OR p_event_key IS DISTINCT FROM btrim(p_event_key)
    OR p_external_status IS DISTINCT FROM btrim(p_external_status)
    OR btrim(COALESCE(p_provider_transaction_id, '')) = ''
    OR btrim(COALESCE(p_event_key, '')) = ''
    OR btrim(COALESCE(p_external_status, '')) = ''
    OR length(p_provider_transaction_id) > 255 OR length(p_event_key) > 255
    OR length(p_external_status) > 255
    OR p_provider_transaction_id ~ '[[:cntrl:]]' OR p_event_key ~ '[[:cntrl:]]'
    OR p_external_status ~ '[[:cntrl:]]'
    OR NOT (p_provider_transaction_id IS NFC NORMALIZED)
    OR NOT (p_event_key IS NFC NORMALIZED) OR NOT (p_external_status IS NFC NORMALIZED)
    OR p_raw_body_digest IS NULL OR p_raw_body_digest !~ '^[0-9a-f]{64}$'
    OR p_raw_body_bytes IS NULL OR p_raw_body_bytes < 1 OR p_raw_body_bytes > 1048576
    OR p_received_at IS NULL OR p_received_at <> date_trunc('milliseconds', p_received_at)
    OR p_actor_principal IS NULL
    OR p_actor_principal IS DISTINCT FROM p_provider::text || ':' || p_event_key
    OR p_actor_principal ~ '[[:cntrl:]]' OR NOT (p_actor_principal IS NFC NORMALIZED)
    OR p_actor_key_id IS DISTINCT FROM btrim(p_actor_key_id)
    OR btrim(COALESCE(p_actor_key_id, '')) = '' OR p_actor_key_id ~ '[[:cntrl:]]'
    OR NOT (p_actor_key_id IS NFC NORMALIZED)
    OR p_actor_nonce IS NULL OR p_actor_nonce = '00000000-0000-0000-0000-000000000000'::uuid
    OR p_actor_issued_at IS NULL
    OR abs(extract(epoch FROM clock_timestamp())::bigint - p_actor_issued_at) > 300
    OR p_actor_signature IS NULL OR p_actor_signature !~ '^[0-9a-f]{64}$'
    OR p_arguments_digest IS NULL OR p_arguments_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid Billing orphan webhook evidence' USING ERRCODE = '22023';
  END IF;

  canonical_received_at := to_char(
    p_received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  canonical_arguments := public.billing_actor_canonical_value('V', 'billing-operation-args:v1')
    || public.billing_actor_canonical_value('E', p_provider::text)
    || public.billing_actor_canonical_value('S', p_provider_transaction_id)
    || public.billing_actor_canonical_value('S', p_event_key)
    || public.billing_actor_canonical_value('S', p_external_status)
    || public.billing_actor_canonical_value('H', p_raw_body_digest)
    || public.billing_actor_canonical_value('I', p_raw_body_bytes::text)
    || public.billing_actor_canonical_value('S', canonical_received_at);
  computed_arguments_digest := encode(
    public.digest(convert_to(canonical_arguments, 'UTF8'), 'sha256'), 'hex'
  );
  IF computed_arguments_digest IS DISTINCT FROM p_arguments_digest THEN
    RAISE EXCEPTION 'Billing orphan webhook arguments digest mismatch' USING ERRCODE = '28000';
  END IF;

  identity_payload := public.billing_actor_canonical_value('V', 'billing-pix-orphan-webhook-id:v1')
    || public.billing_actor_canonical_value('E', p_provider::text)
    || public.billing_actor_canonical_value('S', p_provider_transaction_id)
    || public.billing_actor_canonical_value('S', p_event_key)
    || public.billing_actor_canonical_value('H', p_raw_body_digest);
  identity_hex := encode(public.digest(convert_to(identity_payload, 'UTF8'), 'sha256'), 'hex');
  identity_hex := substring(identity_hex, 1, 12) || '5' || substring(identity_hex, 14, 3)
    || '8' || substring(identity_hex, 18, 15);
  expected_event_id := (
    substring(identity_hex, 1, 8) || '-' || substring(identity_hex, 9, 4) || '-'
    || substring(identity_hex, 13, 4) || '-' || substring(identity_hex, 17, 4) || '-'
    || substring(identity_hex, 21, 12)
  )::uuid;
  IF expected_event_id IS DISTINCT FROM p_event_id THEN
    RAISE EXCEPTION 'Billing orphan webhook deterministic identity mismatch' USING ERRCODE = '28000';
  END IF;

  SELECT k."secret" INTO signing_secret
  FROM public."billing_actor_keys" k
  WHERE k."actorType" = p_actor_type AND k."keyId" = p_actor_key_id AND k."enabled";
  IF signing_secret IS NULL THEN
    RAISE EXCEPTION 'Unknown Billing actor signing key' USING ERRCODE = '28000';
  END IF;
  canonical_payload := public.billing_actor_canonical_value('V', 'billing-actor:v2')
    || public.billing_actor_canonical_value('E', 'billing.pix.quarantine-orphan-webhook')
    || public.billing_actor_canonical_value('U', p_event_id::text)
    || public.billing_actor_canonical_value('U', p_event_id::text)
    || public.billing_actor_canonical_value('U', NULL)
    || public.billing_actor_canonical_value('H', p_raw_body_digest)
    || public.billing_actor_canonical_value('I', '0')
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
      p_actor_nonce, p_actor_type, NULL, p_actor_principal, p_actor_key_id,
      'billing.pix.quarantine-orphan-webhook', p_event_id, p_event_id, NULL,
      p_raw_body_digest, 0, p_arguments_digest, p_actor_issued_at
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Billing actor assertion was already consumed' USING ERRCODE = '28000';
  END;

  INSERT INTO public."billing_pix_orphan_webhook_events" (
    "id", "evidenceVersion", "provider", "providerTransactionId", "eventKey",
    "externalStatus", "rawBodyDigest", "rawBodyBytes", "receivedAt",
    "actorPrincipal", "actorKeyId", "actorNonce"
  ) VALUES (
    p_event_id, 'billing-pix-orphan-webhook:v1', p_provider, p_provider_transaction_id,
    p_event_key, p_external_status, p_raw_body_digest, p_raw_body_bytes, p_received_at,
    p_actor_principal, p_actor_key_id, p_actor_nonce
  ) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF NOT EXISTS (
    SELECT 1 FROM public."billing_pix_orphan_webhook_events" e
    WHERE e."id" = p_event_id AND e."provider" = p_provider
      AND e."providerTransactionId" = p_provider_transaction_id
      AND e."eventKey" = p_event_key AND e."externalStatus" = p_external_status
      AND e."rawBodyDigest" = p_raw_body_digest AND e."rawBodyBytes" = p_raw_body_bytes
  ) THEN
    RAISE EXCEPTION 'Billing orphan webhook idempotency conflict' USING ERRCODE = '23505';
  END IF;
  RETURN QUERY SELECT p_event_id, inserted_count = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON public."billing_pix_orphan_webhook_events" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_orphan_webhook_event_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_pix_quarantine_orphan_webhook(
  UUID, public."PaymentProviderCode", TEXT, TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ,
  public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC;

COMMIT;
