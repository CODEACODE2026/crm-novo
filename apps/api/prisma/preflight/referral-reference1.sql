-- REFERRAL-REFERENCE1 preflight (read-only)
-- Run before prisma migrate deploy. Every statement below is SELECT-only.

SELECT status, COUNT(*) AS total
FROM referrals
GROUP BY status
ORDER BY status;

SELECT
  COUNT(*) AS total_referrals,
  COUNT(*) FILTER (WHERE "qualificationReceivableId" IS NULL) AS without_evidence,
  COUNT(*) FILTER (WHERE "qualificationReceivableId" IS NOT NULL) AS with_evidence
FROM referrals;

-- Must return zero. These rows cannot be backfilled safely.
SELECT
  referral.id AS "referralId",
  referral."referredClientId",
  referral."qualificationReceivableId",
  receivable."clientId" AS "evidenceClientId",
  receivable."clientReferenceId" AS "evidenceReferenceId",
  receivable.purpose AS "evidencePurpose",
  reference."clientId" AS "referenceClientId"
FROM referrals AS referral
LEFT JOIN receivables AS receivable
  ON receivable.id = referral."qualificationReceivableId"
LEFT JOIN client_references AS reference
  ON reference.id = receivable."clientReferenceId"
WHERE referral."qualificationReceivableId" IS NOT NULL
  AND (
       receivable.id IS NULL
   OR receivable."clientId" IS DISTINCT FROM referral."referredClientId"
   OR receivable.purpose <> 'INITIAL_ACTIVATION'
   OR receivable."clientReferenceId" IS NULL
   OR reference.id IS NULL
   OR reference."clientId" IS DISTINCT FROM referral."referredClientId"
  );

-- Must return zero before qualificationReceivableId becomes unique.
SELECT "qualificationReceivableId", COUNT(*) AS total
FROM referrals
WHERE "qualificationReceivableId" IS NOT NULL
GROUP BY "qualificationReceivableId"
HAVING COUNT(*) > 1;

-- Informational: exactly these rows are deterministic backfill candidates.
SELECT
  referral.id AS "referralId",
  referral."referredClientId",
  referral."qualificationReceivableId",
  receivable."clientReferenceId" AS "deterministicReferenceId"
FROM referrals AS referral
JOIN receivables AS receivable
  ON receivable.id = referral."qualificationReceivableId"
JOIN client_references AS reference
  ON reference.id = receivable."clientReferenceId"
WHERE receivable.purpose = 'INITIAL_ACTIVATION'
  AND receivable."clientId" = referral."referredClientId"
  AND reference."clientId" = referral."referredClientId"
  AND receivable."clientReferenceId" IS NOT NULL
ORDER BY referral.id;

-- Must return zero. Two deterministic candidates cannot occupy one target.
SELECT
  receivable."clientReferenceId" AS "deterministicReferenceId",
  COUNT(*) AS total,
  ARRAY_AGG(referral.id ORDER BY referral.id) AS "referralIds"
FROM referrals AS referral
JOIN receivables AS receivable
  ON receivable.id = referral."qualificationReceivableId"
JOIN client_references AS reference
  ON reference.id = receivable."clientReferenceId"
WHERE receivable.purpose = 'INITIAL_ACTIVATION'
  AND receivable."clientId" = referral."referredClientId"
  AND reference."clientId" = referral."referredClientId"
  AND receivable."clientReferenceId" IS NOT NULL
GROUP BY receivable."clientReferenceId"
HAVING COUNT(*) > 1;

-- Informational: these rows remain unbound legacy referrals by design.
SELECT id, "referredClientId", status, "qualificationReceivableId", "createdAt"
FROM referrals
WHERE "qualificationReceivableId" IS NULL
ORDER BY "createdAt", id;

-- Informational: a pending unbound referral blocks creation of a new bound
-- referral for the same client until an administrator resolves it.
SELECT id, "referredClientId", "createdAt"
FROM referrals
WHERE status = 'PENDING'
  AND "qualificationReceivableId" IS NULL
ORDER BY "createdAt", id;
