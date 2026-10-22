-- PHONE-INTERNATIONAL1-DATA1 production preflight.
-- Read-only by design. Run before the migration and review every result set.
-- This SQL classifies legacy evidence; it does not replace libphonenumber validation.

SELECT
  (SELECT COUNT(*) FROM "clients") AS "clientCount",
  (SELECT COUNT(*) FROM "whatsapp_conversations") AS "conversationCount",
  (SELECT COUNT(*) FROM "whatsapp_pending_contacts") AS "pendingContactCount",
  (SELECT COUNT(*) FROM "whatsapp_inbound_messages") AS "inboundSnapshotCount",
  (SELECT COUNT(*) FROM "message_dispatches") AS "dispatchSnapshotCount",
  (SELECT COUNT(*) FROM "receivables" WHERE "payerPhoneNormalized" IS NOT NULL)
    AS "receivablePhoneSnapshotCount";

WITH identity_rows AS (
  SELECT 'CLIENT'::text AS "identityType", "id", NULL::uuid AS "connectionId", "phone", "phoneNormalized"
  FROM "clients"
  UNION ALL
  SELECT 'CONVERSATION', "id", "whatsAppConnectionId", "phone", "phoneNormalized"
  FROM "whatsapp_conversations"
  UNION ALL
  SELECT 'PENDING_CONTACT', "id", "whatsAppConnectionId", "phone", "phoneNormalized"
  FROM "whatsapp_pending_contacts"
), classified AS (
  SELECT
    *,
    REGEXP_REPLACE("phone", '[^0-9]', '', 'g') AS digits,
    CASE
      WHEN LENGTH("phone") > 128 THEN 'INVALID_OVERSIZED'
      WHEN "phone" !~ '[0-9]' THEN 'INVALID_NO_DIGITS'
      WHEN BTRIM("phone") LIKE '+%'
       AND REGEXP_REPLACE("phone", '[^0-9]', '', 'g') ~ '^[1-9][0-9]{1,14}$'
       AND REGEXP_REPLACE("phone", '[^0-9]', '', 'g') ~ '^55'
        THEN 'EXPLICIT_BRAZIL_REQUIRES_LIBRARY_VALIDATION'
      WHEN BTRIM("phone") LIKE '+%'
       AND REGEXP_REPLACE("phone", '[^0-9]', '', 'g') ~ '^[1-9][0-9]{1,14}$'
        THEN 'EXPLICIT_E164_REQUIRES_LIBRARY_VALIDATION'
      WHEN BTRIM("phone") LIKE '+%' THEN 'INVALID_EXPLICIT_INTERNATIONAL_SHAPE'
      WHEN REGEXP_REPLACE("phoneNormalized", '[^0-9]', '', 'g') ~ '^55[1-9][0-9]{9,10}$'
        THEN 'LEGACY_BRAZIL_SHAPE_AMBIGUOUS_COUNTRY'
      ELSE 'AMBIGUOUS_COUNTRY_REVIEW_REQUIRED'
    END AS classification
  FROM identity_rows
)
SELECT
  "identityType",
  classification,
  COUNT(*) AS "recordCount"
FROM classified
GROUP BY "identityType", classification
ORDER BY "identityType", classification;

WITH identity_rows AS (
  SELECT 'CLIENT'::text AS "identityType", "id", NULL::uuid AS "connectionId", "phone", "phoneNormalized"
  FROM "clients"
  UNION ALL
  SELECT 'CONVERSATION', "id", "whatsAppConnectionId", "phone", "phoneNormalized"
  FROM "whatsapp_conversations"
  UNION ALL
  SELECT 'PENDING_CONTACT', "id", "whatsAppConnectionId", "phone", "phoneNormalized"
  FROM "whatsapp_pending_contacts"
), flagged AS (
  SELECT
    *,
    REGEXP_REPLACE("phone", '[^0-9]', '', 'g') AS digits,
    REGEXP_REPLACE("phoneNormalized", '[^0-9]', '', 'g') AS normalized_digits
  FROM identity_rows
)
SELECT
  "identityType",
  "id",
  "connectionId",
  CASE
    WHEN LENGTH(digits) <= 4 THEN REPEAT('*', LENGTH(digits))
    ELSE LEFT(digits, 2) || REPEAT('*', LENGTH(digits) - 4) || RIGHT(digits, 2)
  END AS "maskedOriginalDigits",
  CASE
    WHEN LENGTH(normalized_digits) <= 4 THEN REPEAT('*', LENGTH(normalized_digits))
    ELSE LEFT(normalized_digits, 2)
      || REPEAT('*', LENGTH(normalized_digits) - 4)
      || RIGHT(normalized_digits, 2)
  END AS "maskedLegacyNormalized",
  CASE
    WHEN BTRIM("phone") LIKE '+%'
     AND digits !~ '^55'
     AND normalized_digits ~ '^55'
      THEN 'POTENTIAL_LEGACY_COUNTRY_CORRUPTION_REVIEW_REQUIRED'
    WHEN BTRIM("phone") NOT LIKE '+%'
      THEN 'AMBIGUOUS_COUNTRY_REVIEW_REQUIRED'
    WHEN digits !~ '^[1-9][0-9]{1,14}$'
      THEN 'INVALID_EXPLICIT_INTERNATIONAL_SHAPE'
    ELSE 'EXPLICIT_E164_REQUIRES_LIBRARY_VALIDATION'
  END AS classification
FROM flagged
WHERE
  BTRIM("phone") NOT LIKE '+%'
  OR digits !~ '^[1-9][0-9]{1,14}$'
  OR (digits !~ '^55' AND normalized_digits ~ '^55')
ORDER BY "identityType", "connectionId", "id";

WITH duplicates AS (
  SELECT
    "phoneNormalized",
    REGEXP_REPLACE("phoneNormalized", '[^0-9]', '', 'g') AS digits,
    COUNT(*) AS "duplicateCount",
    ARRAY_AGG("id" ORDER BY "createdAt") AS "clientIds"
  FROM "clients"
  GROUP BY "phoneNormalized"
  HAVING COUNT(*) > 1
)
SELECT
  CASE
    WHEN LENGTH(digits) <= 4 THEN REPEAT('*', LENGTH(digits))
    ELSE LEFT(digits, 2) || REPEAT('*', LENGTH(digits) - 4) || RIGHT(digits, 2)
  END AS "maskedLegacyNormalized",
  "duplicateCount",
  "clientIds",
  'LEGACY_CLIENT_DUPLICATE_REVIEW_REQUIRED' AS classification
FROM duplicates
ORDER BY "duplicateCount" DESC, "maskedLegacyNormalized";

WITH explicit_client_candidates AS (
  SELECT
    "id",
    '+' || REGEXP_REPLACE("phone", '[^0-9]', '', 'g') AS candidate
  FROM "clients"
  WHERE BTRIM("phone") LIKE '+%'
    AND REGEXP_REPLACE("phone", '[^0-9]', '', 'g') ~ '^[1-9][0-9]{1,14}$'
)
SELECT
  LEFT(candidate, 3) || REPEAT('*', GREATEST(LENGTH(candidate) - 5, 0)) || RIGHT(candidate, 2)
    AS "maskedCandidate",
  COUNT(*) AS "collisionCount",
  ARRAY_AGG("id" ORDER BY "id") AS "clientIds",
  'CANONICAL_CLIENT_DUPLICATE_REVIEW_REQUIRED' AS classification
FROM explicit_client_candidates
GROUP BY candidate
HAVING COUNT(*) > 1
ORDER BY "maskedCandidate";

WITH explicit_candidates AS (
  SELECT
    'CONVERSATION'::text AS "identityType",
    "id",
    "whatsAppConnectionId" AS "connectionId",
    '+' || REGEXP_REPLACE("phone", '[^0-9]', '', 'g') AS candidate
  FROM "whatsapp_conversations"
  WHERE BTRIM("phone") LIKE '+%'
    AND REGEXP_REPLACE("phone", '[^0-9]', '', 'g') ~ '^[1-9][0-9]{1,14}$'
  UNION ALL
  SELECT
    'PENDING_CONTACT',
    "id",
    "whatsAppConnectionId",
    '+' || REGEXP_REPLACE("phone", '[^0-9]', '', 'g')
  FROM "whatsapp_pending_contacts"
  WHERE BTRIM("phone") LIKE '+%'
    AND REGEXP_REPLACE("phone", '[^0-9]', '', 'g') ~ '^[1-9][0-9]{1,14}$'
)
SELECT
  "identityType",
  "connectionId",
  LEFT(candidate, 3) || REPEAT('*', GREATEST(LENGTH(candidate) - 5, 0)) || RIGHT(candidate, 2)
    AS "maskedCandidate",
  COUNT(*) AS "collisionCount",
  ARRAY_AGG("id" ORDER BY "id") AS "recordIds",
  'CANONICAL_COLLISION_BLOCKS_AUTOMATIC_BACKFILL' AS classification
FROM explicit_candidates
GROUP BY "identityType", "connectionId", candidate
HAVING COUNT(*) > 1
ORDER BY "identityType", "connectionId";

WITH explicit_conversations AS (
  SELECT
    "id",
    "whatsAppConnectionId" AS "connectionId",
    '+' || REGEXP_REPLACE("phone", '[^0-9]', '', 'g') AS candidate
  FROM "whatsapp_conversations"
  WHERE BTRIM("phone") LIKE '+%'
    AND REGEXP_REPLACE("phone", '[^0-9]', '', 'g') ~ '^[1-9][0-9]{1,14}$'
), explicit_pending AS (
  SELECT
    "id",
    "whatsAppConnectionId" AS "connectionId",
    '+' || REGEXP_REPLACE("phone", '[^0-9]', '', 'g') AS candidate
  FROM "whatsapp_pending_contacts"
  WHERE BTRIM("phone") LIKE '+%'
    AND REGEXP_REPLACE("phone", '[^0-9]', '', 'g') ~ '^[1-9][0-9]{1,14}$'
)
SELECT
  conversation."connectionId",
  conversation."id" AS "conversationId",
  pending."id" AS "pendingContactId",
  LEFT(conversation.candidate, 3)
    || REPEAT('*', GREATEST(LENGTH(conversation.candidate) - 5, 0))
    || RIGHT(conversation.candidate, 2) AS "maskedCandidate",
  'CROSS_IDENTITY_REVIEW_REQUIRED' AS classification
FROM explicit_conversations AS conversation
JOIN explicit_pending AS pending
  ON pending."connectionId" = conversation."connectionId"
 AND pending.candidate = conversation.candidate
ORDER BY conversation."connectionId", conversation."id", pending."id";
