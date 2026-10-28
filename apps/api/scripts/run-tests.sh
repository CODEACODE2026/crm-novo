#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUN_DATABASE_TESTS:-}" != "1" ]]; then
  exec vitest run
fi

database_tests=(
  src/billing/billing-global-review-postgres.test.ts
  src/billing/billing-pix-data-postgres.test.ts
  src/billing/billing-pix-orphan-webhook-correlation-postgres.test.ts
  src/billing/phone-billing-international-postgres.test.ts
  src/clients/client-phone-international-postgres.test.ts
  src/common/phone/phone-international-data-postgres.test.ts
  src/referrals/referral-management-postgres.test.ts
  src/whatsapp/whatsapp-attendance-category-postgres.test.ts
  src/whatsapp/whatsapp-conversation-schema.test.ts
  src/whatsapp/whatsapp-international-postgres.test.ts
)

exclude_args=()
for test_file in "${database_tests[@]}"; do
  exclude_args+=(--exclude "$test_file")
done

# Unit suites keep Vitest's normal parallel isolation. Each PostgreSQL file then
# receives a fresh process and runs alone, while deliberate concurrency inside
# that file continues to use independent connections and transaction barriers.
vitest run "${exclude_args[@]}"
for test_file in "${database_tests[@]}"; do
  vitest run --no-file-parallelism "$test_file"
done
