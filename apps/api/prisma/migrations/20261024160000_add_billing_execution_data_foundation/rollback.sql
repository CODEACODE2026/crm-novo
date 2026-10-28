-- Manual rollback for an unactivated DATA1 deployment only.
-- Do not run after BillingExecution records are used operationally without a separate data-retention plan.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DROP FUNCTION IF EXISTS public.billing_execution_amend_pending_receivable(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.billing_execution_transition(UUID, INTEGER, TEXT, TEXT, public."BillingExecutionStatus", public."BillingPixStatus", public."BillingDeliveryStatus", UUID, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.billing_pix_reconcile_create_result(UUID, INTEGER, TEXT, TEXT, UUID, TEXT, public."PaymentProviderCode", TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.billing_pix_record_create_result(UUID, INTEGER, TEXT, TEXT, UUID, TEXT, public."PaymentProviderCode", TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.billing_pix_prepare_create(UUID, INTEGER, TEXT, TEXT, UUID, TEXT, public."PaymentProviderCode", public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.billing_pix_reserve(UUID, INTEGER, TEXT, TEXT, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.billing_execution_verify_actor(TEXT, UUID, UUID, UUID, TEXT, INTEGER, TEXT, public."BillingActorType", UUID, TEXT, BIGINT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.billing_actor_canonical_value(TEXT, TEXT);
DROP TRIGGER IF EXISTS billing_receivable_reconcile_terminal_status_trigger ON public."receivables";
DROP FUNCTION IF EXISTS public.billing_receivable_reconcile_terminal_status();
DROP TRIGGER IF EXISTS billing_payment_intent_reconcile_paid_trigger ON public."payment_intents";
DROP FUNCTION IF EXISTS public.billing_payment_intent_reconcile_paid();

DROP FUNCTION IF EXISTS public.billing_execution_release_lease(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.billing_execution_renew_lease(UUID, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.billing_execution_acquire_lease(UUID, TEXT, TEXT, INTEGER);
DROP TRIGGER IF EXISTS billing_execution_guard_version_and_lease_trigger ON public."billing_executions";
DROP FUNCTION IF EXISTS public.billing_execution_guard_version_and_lease();
DROP TRIGGER IF EXISTS billing_pix_attempt_write_events_trigger ON public."billing_pix_attempts";
DROP FUNCTION IF EXISTS public.billing_pix_attempt_write_events();
DROP TRIGGER IF EXISTS billing_execution_write_events_trigger ON public."billing_executions";
DROP FUNCTION IF EXISTS public.billing_execution_write_events();
DROP TRIGGER IF EXISTS billing_execution_event_guard_trigger ON public."billing_execution_events";
DROP FUNCTION IF EXISTS public.billing_execution_event_guard();
DROP TRIGGER IF EXISTS billing_payment_group_items_immutable_trigger ON public."payment_group_items";
DROP FUNCTION IF EXISTS public.billing_payment_group_items_immutable();
DROP TRIGGER IF EXISTS billing_payment_group_identity_immutable_trigger ON public."payment_groups";
DROP FUNCTION IF EXISTS public.billing_payment_group_identity_immutable();
DROP TRIGGER IF EXISTS billing_payment_intent_identity_immutable_trigger ON public."payment_intents";
DROP FUNCTION IF EXISTS public.billing_payment_intent_identity_immutable();
DROP TRIGGER IF EXISTS billing_pix_attempt_identity_immutable_trigger ON public."billing_pix_attempts";
DROP FUNCTION IF EXISTS public.billing_pix_attempt_identity_immutable();
DROP TRIGGER IF EXISTS billing_execution_financial_links_on_dispatch ON public."message_dispatches";
DROP TRIGGER IF EXISTS billing_execution_financial_links_on_dispatch_identity ON public."message_dispatches";
DROP TRIGGER IF EXISTS billing_execution_financial_links_on_receivable_status ON public."receivables";
DROP TRIGGER IF EXISTS billing_execution_financial_links_on_intent_change ON public."payment_intents";
DROP FUNCTION IF EXISTS public.billing_execution_revalidate_related();
DROP TRIGGER IF EXISTS billing_execution_financial_links_on_attempt ON public."billing_pix_attempts";
DROP TRIGGER IF EXISTS billing_execution_financial_links_on_execution ON public."billing_executions";
DROP FUNCTION IF EXISTS public.billing_execution_validate_financial_links_trigger();
DROP FUNCTION IF EXISTS public.billing_execution_validate_financial_links(UUID);
DROP TRIGGER IF EXISTS billing_execution_reference_source_immutable_trigger ON public."client_references";
DROP FUNCTION IF EXISTS public.billing_execution_protect_reference_identity();
DROP TRIGGER IF EXISTS billing_execution_receivable_source_immutable_trigger ON public."receivables";
DROP FUNCTION IF EXISTS public.billing_execution_protect_receivable_identity();
DROP TRIGGER IF EXISTS billing_execution_exact_set_on_item_trigger ON public."billing_execution_receivables";
DROP TRIGGER IF EXISTS billing_execution_exact_set_on_execution_trigger ON public."billing_executions";
DROP TRIGGER IF EXISTS billing_execution_receivable_immutable_trigger ON public."billing_execution_receivables";
DROP TRIGGER IF EXISTS billing_pix_attempt_reject_delete_trigger ON public."billing_pix_attempts";
DROP TRIGGER IF EXISTS billing_execution_receivable_reject_delete_trigger ON public."billing_execution_receivables";
DROP TRIGGER IF EXISTS billing_execution_reject_delete_trigger ON public."billing_executions";
DROP FUNCTION IF EXISTS public.billing_execution_reject_delete();
DROP TRIGGER IF EXISTS billing_execution_identity_immutable_trigger ON public."billing_executions";
DROP FUNCTION IF EXISTS public.billing_execution_identity_immutable();
DROP FUNCTION IF EXISTS public.billing_execution_exact_set_on_item();
DROP FUNCTION IF EXISTS public.billing_execution_exact_set_on_execution();
DROP FUNCTION IF EXISTS public.billing_execution_validate_exact_set(UUID);

DROP TRIGGER IF EXISTS billing_execution_payment_intent_link_on_dispatch ON public."message_dispatches";
DROP TRIGGER IF EXISTS billing_execution_payment_intent_link_on_attempt ON public."billing_pix_attempts";
DROP TRIGGER IF EXISTS billing_execution_payment_intent_link_on_execution ON public."billing_executions";
DROP FUNCTION IF EXISTS public.billing_execution_validate_payment_intent_links();

DROP TRIGGER IF EXISTS billing_pix_attempt_transition_trigger ON public."billing_pix_attempts";
DROP FUNCTION IF EXISTS public.billing_pix_attempt_validate_transition();
DROP TRIGGER IF EXISTS billing_execution_transition_trigger ON public."billing_executions";
DROP FUNCTION IF EXISTS public.billing_execution_validate_transitions();
DROP TRIGGER IF EXISTS billing_execution_requires_receivable_on_item ON public."billing_execution_receivables";
DROP TRIGGER IF EXISTS billing_execution_requires_receivable_on_execution ON public."billing_executions";
DROP FUNCTION IF EXISTS public.billing_execution_require_receivable_on_item();
DROP FUNCTION IF EXISTS public.billing_execution_require_receivable_on_execution();
DROP TRIGGER IF EXISTS billing_execution_receivable_identity_trigger ON public."billing_execution_receivables";
DROP FUNCTION IF EXISTS public.billing_execution_validate_receivable_identity();

DROP TABLE IF EXISTS public."billing_actor_assertions";
DROP TABLE IF EXISTS public."billing_actor_keys";
DROP TABLE IF EXISTS public."billing_execution_events";
DROP TABLE IF EXISTS public."billing_pix_attempts";
DROP TABLE IF EXISTS public."billing_execution_receivables";
DROP TABLE IF EXISTS public."billing_executions";

ALTER TABLE public."message_dispatches" DROP COLUMN IF EXISTS "paymentIntentId";
ALTER TABLE public."payment_intents" DROP COLUMN IF EXISTS "creationKey", DROP COLUMN IF EXISTS "origin";

DROP TYPE IF EXISTS public."BillingExecutionEventType";
DROP TYPE IF EXISTS public."BillingAuditOrigin";
DROP TYPE IF EXISTS public."BillingActorType";
DROP TYPE IF EXISTS public."BillingAuthorizationMode";
DROP TYPE IF EXISTS public."BillingDeliveryStatus";
DROP TYPE IF EXISTS public."BillingPixStatus";
DROP TYPE IF EXISTS public."BillingExecutionStatus";
DROP TYPE IF EXISTS public."PaymentIntentOrigin";

COMMIT;
