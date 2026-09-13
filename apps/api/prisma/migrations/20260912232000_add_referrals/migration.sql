ALTER TYPE "ClientEventType" ADD VALUE IF NOT EXISTS 'REFERRAL_CREATED';
ALTER TYPE "ClientEventType" ADD VALUE IF NOT EXISTS 'REFERRAL_QUALIFIED';
ALTER TYPE "ClientEventType" ADD VALUE IF NOT EXISTS 'REFERRAL_REWARD_APPLIED';
ALTER TYPE "ClientEventType" ADD VALUE IF NOT EXISTS 'REFERRAL_CANCELED';

CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REWARDED', 'CANCELED');

CREATE TYPE "ReferralRewardType" AS ENUM ('FREE_MONTH', 'CREDIT', 'CUSTOM');

CREATE TABLE "referrals" (
  "id" UUID NOT NULL,
  "referredClientId" UUID NOT NULL,
  "referrerClientId" UUID NOT NULL,
  "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "rewardType" "ReferralRewardType" NOT NULL DEFAULT 'FREE_MONTH',
  "rewardValue" DECIMAL(12,2),
  "rewardDescription" TEXT,
  "qualifiedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "appliedPreviousDueDate" DATE,
  "appliedNewDueDate" DATE,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referrals_no_self_referral" CHECK ("referredClientId" <> "referrerClientId")
);

CREATE UNIQUE INDEX "referrals_referredClientId_key" ON "referrals"("referredClientId");
CREATE INDEX "referrals_referrerClientId_idx" ON "referrals"("referrerClientId");
CREATE INDEX "referrals_status_idx" ON "referrals"("status");
CREATE INDEX "referrals_rewardType_idx" ON "referrals"("rewardType");
CREATE INDEX "referrals_createdAt_idx" ON "referrals"("createdAt");
CREATE INDEX "referrals_qualifiedAt_idx" ON "referrals"("qualifiedAt");
CREATE INDEX "referrals_appliedAt_idx" ON "referrals"("appliedAt");

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_referredClientId_fkey"
  FOREIGN KEY ("referredClientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_referrerClientId_fkey"
  FOREIGN KEY ("referrerClientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
