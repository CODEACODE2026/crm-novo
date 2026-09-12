ALTER TYPE "ClientStatus" ADD VALUE 'PENDENTE_PAGAMENTO';

CREATE TYPE "ReceivablePurpose" AS ENUM ('RENEWAL', 'INITIAL_ACTIVATION');

ALTER TABLE "receivables"
  ADD COLUMN "purpose" "ReceivablePurpose" NOT NULL DEFAULT 'RENEWAL',
  ALTER COLUMN "renewalId" DROP NOT NULL;

CREATE INDEX "receivables_purpose_idx" ON "receivables"("purpose");

ALTER TYPE "MessageDispatchOrigin" ADD VALUE 'INITIAL_ACTIVATION';

ALTER TYPE "MessageTemplateType" ADD VALUE 'INITIAL_ACTIVATION';
