# MERCADOPAGO-PIX-CORE1 — IMPLEMENTATION REPORT

## Verdict

**READY FOR NEXT PHASE**

CORE1 is implemented and validated in an isolated worktree. Mercado Pago remains disabled by default. No production access, real Pix, real WhatsApp send, push, pull request, merge, deployment, or production migration occurred.

UI, WhatsApp card delivery, webhook settlement, grouped payments, renewal, activation, and reactivation remain outside this phase and are explicitly blocked where a Mercado Pago group or webhook could otherwise be selected.

## Git baseline

- Repository: `/opt/codeacode/repos/crm-novo`
- Worktree: `/opt/codeacode/worktrees/mercadopago-pix-core1`
- Branch: `feature/mercadopago-pix-core1`
- Baseline commit: `7e8edb35d365002aed9b9d82264529a5348939d3`
- Baseline tree: `8069105cbf097b25ec99ba40c48c952edfaafb11`
- Baseline subject: `Merge pull request #4 from CODEACODE2026/feature/client-email1`
- `origin/main` was confirmed at the same commit and tree before editing.

## Official Orders API contract used

Official Mercado Pago sources audited on 2026-11-01:

- Pix with Checkout Transparente Orders API: <https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix>
- Create an online-payment order: <https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api/create-order/post>
- Get order by ID: <https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api/get-order/get>

Implemented contract:

- `POST https://api.mercadopago.com/v1/orders`
- Backend-only `Authorization: Bearer ...`
- Required `X-Idempotency-Key`, limited to the documented 1–128 character interval
- `type=online`, `processing_mode=automatic`
- `total_amount` and payment `amount` serialized with two decimal places
- `external_reference` limited to 64 characters and the documented alphanumeric, hyphen, and underscore alphabet
- `transactions.payments[0].payment_method={ id: "pix", type: "bank_transfer" }`
- Payment `expiration_time` as an ISO-8601 duration, constrained to 30 minutes through 30 days
- Required `payer.email`
- `GET /v1/orders/{order_id}` for status consultation
- Order ID, payment ID, status/detail, amount, Pix Copia e Cola (`qr_code`), QR image (`qr_code_base64`), and expiration normalized into the existing CRM provider contract
- Initial `action_required/waiting_transfer` state mapped to `WAITING_PAYMENT`
- `processed/accredited` mapped to `PAID`; cancellation, expiration, refund, and failure states are kept distinct

Creation additionally rejects a response with a divergent external reference, amount, non-BRL currency when currency is returned, or a payment method other than Pix bank transfer.

## Adapter and architecture

Added:

- `MercadoPagoApiClient`: typed HTTP client, timeout through `AbortController`, sanitized provider errors, HTTPS enforcement in production, create order, get order, and credential identity validation.
- `MercadoPagoPaymentProvider`: e-mail validation, stable idempotency/external reference, request construction, response normalization, QR/Pix extraction, amount and contract checks, and status consultation.
- Registry and Nest DI wiring so Mercado Pago is resolved only when explicitly selected.

The provider reuses the existing `PaymentProvider` / `PaymentIntent` pipeline. No second billing system, revenue calculation, settlement path, scheduler, or webhook path was created.

## E-mail rules

- `Client.email` remains optional globally.
- Name and phone behavior was not changed.
- Mercado Pago creation requires a valid e-mail in the provider adapter and fails before any remote call when it is absent or invalid.
- The existing client e-mail is forwarded automatically by the individual receivable flow.
- No fictitious e-mail and no CPF requirement were added.
- Contextual e-mail capture and the explicit save choice belong to `MERCADOPAGO-PIX-UI1` and were not implemented in CORE1.

## Identifiers, retry, and idempotency

- Initial individual creation uses the durable `PaymentIntent.id` as both `X-Idempotency-Key` and `external_reference`.
- Replacement uses a stable reference derived from the current intent and selected provider, restricted to the official external-reference alphabet.
- A safe retry sends the same idempotency key and payload.
- An unresolved remote timeout remains fail-safe in the existing `CREATED` reservation flow; the CRM does not create a second intent blindly.
- Order ID and payment ID are stored separately in the existing provider fields.
- Grouped Mercado Pago creation is rejected until `MERCADOPAGO-PIX-GROUP1`.

## Configuration and credentials

- `MERCADO_PAGO_ENABLED=false` by default (fail-closed).
- `MERCADO_PAGO_ENVIRONMENT=TEST|PRODUCTION`, with TEST as the safe runtime fallback when disabled.
- Separate encrypted credential records for TEST and PRODUCTION.
- Access tokens remain backend-only and are never returned by presentation methods.
- Token validation uses the provider identity endpoint before encrypted persistence.
- Configurable API and identity base URLs, production HTTPS validation, and configurable HTTP timeout.
- Mercado Pago cannot become the default Pix provider in CORE1.
- Existing FastDepix-family credential behavior and the current default provider remain unchanged.

The TEST/PRODUCTION labels are CRM-side isolation. Mercado Pago's current documentation uses the same API host and distinguishes test operation through the authorized test account/credential model.

## Proposed migration

File: `apps/api/prisma/migrations/20261101211000_add_mercado_pago_payment_provider/migration.sql`

Schema effects:

1. Add `MERCADO_PAGO` to `PaymentProviderCode`.
2. Add `PaymentProviderEnvironment` with `TEST` and `PRODUCTION`.
3. Add non-null `payment_provider_credentials.environment` with default `PRODUCTION`.
4. Add an index on `(provider, environment, active)`.

Existing credential rows are preserved and classified as `PRODUCTION`; no token, provider choice, default flag, receivable, intent, transaction, or financial value is rewritten. The migration was executed only in a disposable PostgreSQL 12.22 database, never against production.

The historical migration chain requires `pgcrypto`/`gen_random_uuid()`. The first empty-database attempt without that established prerequisite stopped at a historical migration; after creating the required extension, all 57 migrations applied successfully, including CORE1. The disposable database was removed afterward.

## Files created

- `apps/api/prisma/migrations/20261101211000_add_mercado_pago_payment_provider/migration.sql`
- `apps/api/src/finance/mercado-pago-core-migration.test.ts`
- `apps/api/src/finance/payments/mercado-pago-api.client.ts`
- `apps/api/src/finance/payments/mercado-pago-api.client.test.ts`
- `apps/api/src/finance/payments/mercado-pago-payment.provider.ts`
- `apps/api/src/finance/payments/mercado-pago-payment.provider.test.ts`
- `docs/project/MERCADOPAGO-PIX-CORE1-IMPLEMENTATION-REPORT.md`

## Files changed

- `apps/api/.env.example`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/config/env.validation.ts`
- `apps/api/src/config/env.validation.test.ts`
- `apps/api/src/finance/dto/save-payment-provider-credential.dto.ts`
- `apps/api/src/finance/finance.module.ts`
- `apps/api/src/finance/finance.service.ts`
- `apps/api/src/finance/finance.service.test.ts`
- `apps/api/src/finance/payments/payment-provider.ts`
- `apps/api/src/finance/payments/payment-provider-registry.service.ts`
- `apps/api/src/finance/payments/payment-provider-credentials.service.ts`
- `apps/api/src/finance/payments/payment-provider-credentials.service.test.ts`
- `apps/api/src/finance/payments/payment-provider-di.test.ts`

## Validation evidence

- API full suite: **70 files passed, 1,930 tests passed**; 10 PostgreSQL-gated files / 105 tests skipped outside their dedicated profile.
- Web full suite: **49 files passed, 832 tests passed**.
- Focused Mercado Pago/finance suite after final contract hardening: **4 files, 323 tests passed**.
- PostgreSQL 12.22 disposable proof: **57/57 migrations applied**, with schema/enum/index assertions passing.
- Root lint: passed with zero errors. Six pre-existing warnings remain in untouched web/recovery files.
- Root typecheck: passed for shared, API, and web.
- Root build: passed for shared, API, and web. Existing Next.js image/autoprefixer warnings remain outside this change.
- Final API lint, typecheck, and build after contract hardening: passed.
- `git diff --check`: passed.
- No official sandbox API call was made because no authorized test credential/environment was supplied; no token was requested in chat and no real Pix was created.

## Risks and limitations retained for later phases

- No UI selection, contextual e-mail form, QR presentation, or e-mail persistence choice yet (`UI1`).
- No WhatsApp card/send work yet; the exact existing card and **Copiar Chave PIX** button remain a mandatory gate for `WHATSAPP1`.
- No webhook signature verification, server-to-server settlement confirmation, replay defense, or lost-event reconciliation yet (`WEBHOOK1`). Mercado Pago webhook operations are blocked in CORE1.
- No grouped payment, renewal, activation, reactivation, or financial settlement change yet (`GROUP1`). Grouped Mercado Pago creation is blocked in CORE1.
- Provider polling is available at adapter level but is not a substitute for the future signed webhook plus server-to-server verification flow.
- A live sandbox contract proof remains pending authorized test credentials. This does not authorize production enablement.

## Scope attestation

- BillingScheduler and RecoveryScheduler: unchanged.
- Existing payment adapters and their request contracts: unchanged.
- Existing default provider: unchanged.
- Financial formulas and revenue aggregation: unchanged.
- UI and WhatsApp files: unchanged.
- No secret committed or logged.
- No production access or mutation.
- No push, PR, merge, or deploy.

## Local commit

The final local commit hash and tree are recorded after this report is committed.
