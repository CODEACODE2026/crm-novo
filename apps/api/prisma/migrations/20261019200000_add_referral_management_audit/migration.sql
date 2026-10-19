CREATE TYPE "ReferralOrigin" AS ENUM ('AUTOMATIC', 'MANUAL');

CREATE TYPE "ReferralHistoryAction" AS ENUM (
  'CREATED',
  'QUALIFIED',
  'UPDATED',
  'CANCELED',
  'REWARD_APPLIED'
);

ALTER TABLE "referrals"
  ADD COLUMN "origin" "ReferralOrigin" NOT NULL DEFAULT 'AUTOMATIC',
  ADD COLUMN "qualificationReceivableId" UUID,
  ADD COLUMN "canceledByUserId" UUID;

CREATE INDEX "referrals_origin_idx" ON "referrals"("origin");
CREATE INDEX "referrals_qualificationReceivableId_idx"
  ON "referrals"("qualificationReceivableId");
CREATE INDEX "referrals_canceledByUserId_idx" ON "referrals"("canceledByUserId");

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_qualificationReceivableId_fkey"
  FOREIGN KEY ("qualificationReceivableId") REFERENCES "receivables"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_canceledByUserId_fkey"
  FOREIGN KEY ("canceledByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "referral_history" (
  "id" UUID NOT NULL,
  "referralId" UUID NOT NULL,
  "action" "ReferralHistoryAction" NOT NULL,
  "actorUserId" UUID,
  "reason" TEXT,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "referral_history_referralId_createdAt_idx"
  ON "referral_history"("referralId", "createdAt");
CREATE INDEX "referral_history_actorUserId_idx" ON "referral_history"("actorUserId");
CREATE INDEX "referral_history_action_idx" ON "referral_history"("action");

ALTER TABLE "referral_history"
  ADD CONSTRAINT "referral_history_referralId_fkey"
  FOREIGN KEY ("referralId") REFERENCES "referrals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_history"
  ADD CONSTRAINT "referral_history_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
